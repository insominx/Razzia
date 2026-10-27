import { EVENTS } from "@razzia/common/constants"
import type { LectureOutcome } from "@razzia/common/types/game"
import { STATUS } from "@razzia/common/types/game/status"
import { isAllowedDeckOrigin } from "@razzia/web/features/deck/embed"
import {
  forgetGame,
  localStorageOrNull,
  recallGame,
  rememberGame,
} from "@razzia/web/features/deck/game-memory"
import {
  buildBridgeState,
  planRoundCommand,
} from "@razzia/web/features/deck/plan"
import {
  BRIDGE_SOURCE,
  type BridgeMessageBody,
  type BridgeState,
  type DeckCommand,
  parseDeckCommand,
  PROTOCOL_VERSION,
  type RoundCommand,
  toForwardedKey,
} from "@razzia/web/features/deck/protocol"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useSoundStore } from "@razzia/web/features/game/stores/sound"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"

const ACK_TIMEOUT_MS = 5_000
const HEARTBEAT_MS = 5_000
const CREATE_TIMEOUT_MS = 10_000
const REATTACH_EVERY_MS = 5_000
// Longer than the server takes to drop a dead connection (25 s + 20 s pings).
const REATTACH_FOR_MS = 90_000
// A command queued longer than this would start a question wherever the deck
// has moved on to since.
const QUEUE_FOR_MS = 10_000

const LOGIN_PATH = "/manager"
const CONFIG_PATH = "/manager/config"
const GAME_PATH = /^\/party\/manager\/([^/]+)$/

interface EnsureRequest {
  quiz: string
  restart?: "ifFinished" | "always"
}

// Lets a lecture deck that frames this page run a lecture game: it creates or
// resumes the game, plays the questions the deck asks for, reports what is on
// screen, and hands the deck's keys back to it.
export const useDeckBridge = () => {
  const { socket, isConnected } = useSocket()
  const navigate = useNavigate()
  const pathname = useRouterState({
    select: (routerState) => routerState.location.pathname,
  })
  const { gameId, status, config, lecture, setConfig, responses, review } =
    useManagerStore()

  const [deckOrigin, setDeckOrigin] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [attached, setAttached] = useState(false)
  const [players, setPlayers] = useState(0)
  const [visible, setVisible] = useState(false)
  // Read by the next message before a render catches up.
  const visibleNow = useRef(false)
  const [ensure, setEnsure] = useState<EnsureRequest | null>(null)
  const [pending, setPending] = useState<BridgeState["pending"]>(null)
  const [reattaching, setReattaching] = useState(false)

  const quiz = useRef<string | null>(null)
  const queued = useRef<{ command: RoundCommand; at: number } | null>(null)
  const createSentAt = useRef<number | null>(null)
  const configRequested = useRef(false)
  const retryTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPosted = useRef("")

  const state = buildBridgeState({
    connected: isConnected,
    loggedIn,
    pending,
    reattaching,
    attached,
    gameId,
    lecture,
    status,
    players,
    visible,
    review,
    reviewable: Object.keys(responses)
      .map(Number)
      .sort((a, b) => a - b),
  })
  const stateRef = useRef(state)

  const post = useCallback(
    (body: BridgeMessageBody, origin: string | null = deckOrigin) => {
      if (!origin) {
        return
      }

      window.parent.postMessage(
        { source: BRIDGE_SOURCE, v: PROTOCOL_VERSION, ...body },
        origin,
      )
    },
    [deckOrigin],
  )

  const stopRetry = useCallback(() => {
    if (retryTimer.current) {
      clearInterval(retryTimer.current)
      retryTimer.current = null
    }

    setReattaching(false)
  }, [])

  // The server still holds this frame's old connection for up to 45 s after
  // a network drop; keep asking until it lets the new one in.
  const startRetry = useCallback(
    (target: string) => {
      if (retryTimer.current) {
        return
      }

      const until = Date.now() + REATTACH_FOR_MS
      setReattaching(true)

      retryTimer.current = setInterval(() => {
        if (Date.now() >= until) {
          stopRetry()
          post({ type: "error", code: "reattachFailed" })

          return
        }

        socket.emit(EVENTS.MANAGER.RECONNECT, { gameId: target })
      }, REATTACH_EVERY_MS)
    },
    [post, socket, stopRetry],
  )

  const reportOutcome = (
    command: RoundCommand,
    error: Error | null,
    outcome?: LectureOutcome,
  ) => {
    // A command that did not run brings no screen to end a review with.
    if (error || outcome !== "accepted") {
      useManagerStore.setState({ reviewEndsWithScreen: false })
    }

    if (error || !outcome) {
      post({ type: "error", code: "noAck", command: command.type })

      return
    }

    post({
      type: "result",
      command: command.type,
      outcome: outcome === "accepted" ? "accepted" : "ignored",
      ...(outcome === "accepted" ? {} : { reason: outcome }),
    })

    if (outcome === "noPlayers") {
      post({ type: "error", code: "noPlayers", command: command.type })
    }
  }

  const emitRound = (command: RoundCommand, target: string) => {
    useManagerStore.getState().endReviewWithNextScreen()

    if (command.type === "leaderboard") {
      socket.emit(EVENTS.MANAGER.SHOW_LEADERBOARD, { gameId: target })
      post({ type: "result", command: command.type, outcome: "accepted" })

      return
    }

    if (command.type === "play") {
      socket
        .timeout(ACK_TIMEOUT_MS)
        .emit(
          EVENTS.MANAGER.PLAY_QUESTION,
          { gameId: target, index: command.question },
          (error: Error | null, outcome?: LectureOutcome) => {
            reportOutcome(command, error, outcome)
          },
        )

      return
    }

    socket
      .timeout(ACK_TIMEOUT_MS)
      .emit(
        EVENTS.MANAGER.FINISH_GAME,
        { gameId: target },
        (error: Error | null, outcome?: LectureOutcome) => {
          reportOutcome(command, error, outcome)
        },
      )
  }

  const runRound = (command: RoundCommand) => {
    const plan = planRoundCommand(command, {
      attached,
      lecture,
      screen: status?.name ?? null,
    })

    if (plan.kind === "queue") {
      queued.current = { command, at: Date.now() }
      post({ type: "result", command: command.type, outcome: "queued" })

      return
    }

    if (plan.kind === "ignore") {
      post({
        type: "result",
        command: command.type,
        outcome: "ignored",
        reason: plan.reason,
      })

      return
    }

    if (plan.kind === "notLectureGame" || !gameId) {
      post({ type: "error", code: "notLectureGame", command: command.type })

      return
    }

    emitRound(command, gameId)
  }

  const handleCommand = (command: DeckCommand, origin: string) => {
    if (deckOrigin !== origin) {
      setDeckOrigin(origin)
    }

    if (command.type === "hello") {
      post({ type: "ready", state: stateRef.current }, origin)

      return
    }

    if (command.type === "ensureGame") {
      // Restart quiz: a reconnect loop for the old game would take it back.
      if (command.restart === "always") {
        stopRetry()
      }

      quiz.current = command.quiz
      setEnsure({ quiz: command.quiz, restart: command.restart })

      return
    }

    if (command.type === "close") {
      // Leaving the game's page closes a lecture game. A reconnect loop still
      // running would bring the old game back later.
      stopRetry()
      forgetGame({ storage: localStorageOrNull(), quiz: command.quiz })
      queued.current = null
      createSentAt.current = null
      setEnsure(null)
      setPending(null)
      setAttached(false)
      setPlayers(0)

      if (pathname !== CONFIG_PATH) {
        navigate({ to: CONFIG_PATH, replace: true })
      }

      post({ type: "result", command: "close", outcome: "accepted" }, origin)

      return
    }

    if (command.type === "visibility") {
      visibleNow.current = command.visible
      setVisible(command.visible)
      useSoundStore
        .getState()
        .setSuppressed(
          !command.visible || useManagerStore.getState().review !== null,
        )

      return
    }

    // A review is silent: the results sound and music belong to the round.
    // Results this page never saw (a reload since) are not shown.
    if (command.type === "review") {
      const store = useManagerStore.getState()
      const question =
        command.question !== null && command.question in store.responses
          ? command.question
          : null

      store.setReview(question)
      useSoundStore
        .getState()
        .setSuppressed(!visibleNow.current || question !== null)

      return
    }

    if (command.type === "controls") {
      useManagerStore.getState().setHostControls(command.shown)

      return
    }

    runRound(command)
  }

  const handlerRef = useRef(handleCommand)

  useEffect(() => {
    handlerRef.current = handleCommand
    stateRef.current = state
  })

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== window.parent ||
        !isAllowedDeckOrigin(event.origin)
      ) {
        return
      }

      const command = parseDeckCommand(event.data)

      if (command) {
        handlerRef.current(command, event.origin)
      }
    }

    window.addEventListener("message", onMessage)

    return () => {
      window.removeEventListener("message", onMessage)
    }
  }, [])

  // Hidden behind the deck, the page stays quiet until the deck shows it.
  useEffect(() => {
    useSoundStore.getState().setSuppressed(true)

    return () => {
      useSoundStore.getState().setSuppressed(false)
    }
  }, [])

  // The handlers above mute at once; this also catches a review that the
  // game's next screen ended, which no deck message reports.
  useEffect(() => {
    useSoundStore.getState().setSuppressed(!visible || review !== null)
  }, [visible, review])

  useEffect(() => {
    if (isConnected) {
      socket.emit(EVENTS.MANAGER.GET_CONFIG)
    } else {
      setAttached(false)
    }
  }, [isConnected, socket])

  useEffect(
    () => () => {
      if (retryTimer.current) {
        clearInterval(retryTimer.current)
      }
    },
    [],
  )

  useEvent("connect", () => {
    setAttached(false)
  })

  useEvent(EVENTS.MANAGER.CONFIG, (data) => {
    setLoggedIn(true)
    setConfig(data)
  })

  useEvent(EVENTS.MANAGER.UNAUTHORIZED, () => {
    setLoggedIn(false)
  })

  useEvent(EVENTS.MANAGER.SUCCESS_RECONNECT, () => {
    setAttached(true)
    stopRetry()
  })

  useEvent(EVENTS.MANAGER.GAME_CREATED, ({ gameId: createdId }) => {
    if (createSentAt.current !== null && quiz.current) {
      rememberGame({
        storage: localStorageOrNull(),
        quiz: quiz.current,
        gameId: createdId,
      })
    }

    createSentAt.current = null
    setPlayers(0)
    setAttached(true)
  })

  useEvent(EVENTS.GAME.TOTAL_PLAYERS, (count) => {
    setPlayers(count)
  })

  useEvent(EVENTS.GAME.ERROR_MESSAGE, (message) => {
    if (message !== "errors:quizz.notFound" || createSentAt.current === null) {
      return
    }

    createSentAt.current = null
    setEnsure(null)
    setPending(null)
    post({ type: "error", code: "quizNotFound", command: "ensureGame" })
  })

  useEvent(EVENTS.GAME.RESET, (message) => {
    setAttached(false)

    if (message === "errors:game.managerAlreadyConnected") {
      const target =
        GAME_PATH.exec(pathname)?.[1] ??
        (quiz.current
          ? recallGame({ storage: localStorageOrNull(), quiz: quiz.current })
          : null)

      if (target) {
        startRetry(target)
      }

      return
    }

    // The game is gone; the next ensureGame starts a new one. A reconnect loop
    // for it would only block that for a minute and a half.
    stopRetry()

    if (quiz.current) {
      forgetGame({ storage: localStorageOrNull(), quiz: quiz.current })
    }

    post({ type: "error", code: "gameExpired" })
  })

  // Converges on a lecture game for the requested quiz: resume the one this
  // frame remembers, or log in and create one.
  useEffect(() => {
    if (!ensure || !isConnected || loggedIn === null) {
      return
    }

    if (!loggedIn) {
      setPending("login")

      if (pathname !== LOGIN_PATH) {
        navigate({ to: LOGIN_PATH, replace: true })
      }

      return
    }

    const storage = localStorageOrNull()

    // A restart on request: leave the game (which closes it) once, then fall
    // through to creating a new one on the next pass.
    if (ensure.restart === "always") {
      forgetGame({ storage, quiz: ensure.quiz })
      queued.current = null
      setEnsure({ quiz: ensure.quiz })
      setAttached(false)
      setPlayers(0)

      if (pathname !== CONFIG_PATH) {
        navigate({ to: CONFIG_PATH, replace: true })
      }

      return
    }

    const remembered = recallGame({ storage, quiz: ensure.quiz })
    const finished =
      lecture?.finished === true || status?.name === STATUS.FINISHED

    if (attached && gameId) {
      const restart = ensure.restart === "ifFinished" && finished

      if (lecture && !restart) {
        if (remembered !== gameId) {
          rememberGame({ storage, quiz: ensure.quiz, gameId })
        }

        setEnsure(null)
        setPending(null)
        post({ type: "result", command: "ensureGame", outcome: "accepted" })

        return
      }

      // A finished lecture, or a game this deck did not start: leaving its
      // page closes it, then a new lecture game is created.
      forgetGame({ storage, quiz: ensure.quiz })
      setAttached(false)
      navigate({ to: CONFIG_PATH, replace: true })

      return
    }

    if (remembered) {
      setPending("resume")

      if (pathname !== `/party/manager/${remembered}`) {
        navigate({
          to: "/party/manager/$gameId",
          params: { gameId: remembered },
          replace: true,
        })
      }

      return
    }

    setPending("create")

    if (!config) {
      if (!configRequested.current) {
        configRequested.current = true
        socket.emit(EVENTS.MANAGER.GET_CONFIG)
      }

      return
    }

    configRequested.current = false

    if (pathname !== CONFIG_PATH) {
      navigate({ to: CONFIG_PATH, replace: true })

      return
    }

    // Only the config page follows a created game to its lobby.
    const inFlight =
      createSentAt.current !== null &&
      Date.now() - createSentAt.current < CREATE_TIMEOUT_MS

    if (!inFlight) {
      createSentAt.current = Date.now()
      socket.emit(EVENTS.GAME.CREATE_LECTURE, ensure.quiz)
    }
  }, [
    attached,
    config,
    ensure,
    gameId,
    isConnected,
    lecture,
    loggedIn,
    navigate,
    pathname,
    post,
    socket,
    status,
  ])

  // A command that arrived while this page was not yet the manager.
  useEffect(() => {
    const entry = queued.current

    if (!entry || !attached || !status) {
      return
    }

    queued.current = null

    if (Date.now() - entry.at > QUEUE_FOR_MS) {
      post({
        type: "result",
        command: entry.command.type,
        outcome: "ignored",
        reason: "expired",
      })

      return
    }

    runRound(entry.command)
  })

  useEffect(() => {
    if (!deckOrigin) {
      return
    }

    const json = JSON.stringify(state)

    if (json === lastPosted.current) {
      return
    }

    lastPosted.current = json
    post({ type: "status", state })
  })

  // A heartbeat, so the deck can tell a quiet page from a dead one.
  useEffect(() => {
    if (!deckOrigin) {
      return
    }

    const timer = setInterval(() => {
      post({ type: "status", state: stateRef.current })
    }, HEARTBEAT_MS)

    return () => {
      clearInterval(timer)
    }
  }, [deckOrigin, post])

  useEffect(() => {
    if (!deckOrigin) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const key = toForwardedKey(event)

      if (!key) {
        return
      }

      // Space on a focused button would also press it.
      event.preventDefault()
      event.stopPropagation()
      post({ type: "key", ...key })
    }

    window.addEventListener("keydown", onKeyDown, true)

    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
    }
  }, [deckOrigin, post])
}
