import { EVENTS } from "@razzia/common/constants"
import type { LectureOutcome } from "@razzia/common/types/game"
import { STATUS } from "@razzia/common/types/game/status"
import type { PollOutcome } from "@razzia/common/types/poll"
import { applyBackdrop } from "@razzia/web/features/deck/backdrop"
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
  isPollCommand,
  isPollStart,
  parseDeckCommand,
  type PollCommand,
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
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
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

// The sound is off whenever the deck cannot be seeing this page, while a
// review is up, and while a poll shows: the lobby stays mounted under a poll,
// and its music bed and join chimes would otherwise play under the question.
const isSilent = (
  visible: boolean,
  review: number | null,
  pollShowing: boolean,
): boolean => !visible || review !== null || pollShowing

const LOGIN_PATH = "/manager"
const CONFIG_PATH = "/manager/config"
const GAME_PATH = /^\/party\/manager\/([^/]+)$/

interface EnsureRequest {
  quiz: string
  restart?: "ifFinished" | "always"
}

// End quiz or Restart quiz, waiting for this connection to be the game's
// manager again.
interface HeldCommand {
  type: "close" | "restart"
  quiz: string
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
  const {
    gameId,
    status,
    config,
    lecture,
    setConfig,
    responses,
    review,
    players: roster,
    presenceKnown,
  } = useManagerStore()
  const poll = usePollStore((store) => store.snapshot)
  const pollReview = usePollStore((store) => store.review)
  const pollShowing = poll !== null
  // What the frame shows, for its sound: a poll on the stage or one shown again.
  const pollOnScreen = pollShowing || pollReview !== null
  const soundMuted = useSoundStore((store) => store.muted)
  const soundVolume = useSoundStore((store) => store.volume)

  const [deckOrigin, setDeckOrigin] = useState<string | null>(null)
  // The same origin, written the moment a message arrives: a reply sent from
  // that message, and the retry's timer, would otherwise see an older render's.
  const deckOriginRef = useRef<string | null>(null)
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [attached, setAttached] = useState(false)
  const [players, setPlayers] = useState(0)
  const [visible, setVisible] = useState(false)
  // Read by the next message before a render catches up.
  const visibleNow = useRef(false)
  const [ensure, setEnsure] = useState<EnsureRequest | null>(null)
  const [pending, setPending] = useState<BridgeState["pending"]>(null)
  const [reattaching, setReattaching] = useState(false)
  // Bumped when a create has waited its full time, to check on it again.
  const [createCheck, setCreateCheck] = useState(0)

  const quiz = useRef<string | null>(null)
  const queued = useRef<{ command: RoundCommand; at: number } | null>(null)
  const held = useRef<HeldCommand | null>(null)
  const createSentAt = useRef<number | null>(null)
  const createTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const configRequested = useRef(false)
  const retryTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryFailed = useRef<(() => void) | null>(null)
  const lastPosted = useRef("")
  // The game this page is attached to, and the quiz it was made or resumed for.
  const gameQuiz = useRef<{ gameId: string; quiz: string } | null>(null)
  // When a leave went out with a create still on the wire.
  const abandonedCreateAt = useRef<number | null>(null)

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
    connectedPlayers: presenceKnown
      ? roster.filter((player) => player.connected).length
      : undefined,
    visible,
    review,
    reviewable: Object.keys(responses)
      .map(Number)
      .sort((a, b) => a - b),
    poll,
    pollReview: pollReview?.id ?? null,
    sound: { muted: soundMuted, volume: soundVolume },
  })
  const stateRef = useRef(state)

  const post = useCallback(
    (
      body: BridgeMessageBody,
      origin: string | null = deckOriginRef.current,
    ) => {
      if (!origin) {
        return
      }

      window.parent.postMessage(
        { source: BRIDGE_SOURCE, v: PROTOCOL_VERSION, ...body },
        origin,
      )
    },
    [],
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
          retryFailed.current?.()

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

  // A command answered "queued" gets its final answer even when it is dropped.
  const settleQueued = (reason: string, origin?: string) => {
    const entry = queued.current
    queued.current = null

    if (entry) {
      post(
        {
          type: "result",
          command: entry.command.type,
          outcome: "ignored",
          reason,
        },
        origin,
      )
    }
  }

  const reportPollOutcome = (
    command: PollCommand,
    error: Error | null,
    outcome?: PollOutcome,
  ) => {
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

    if (outcome === "invalid") {
      post({ type: "error", code: "pollInvalid", command: command.type })
    }
  }

  // Poll commands are never queued, unlike a question: a start that ran late
  // would open a vote on whatever slide the deck has moved on to, so a page
  // that is not yet the room's manager answers `notAttached` and the deck
  // decides what the presenter sees.
  const runPoll = (command: PollCommand) => {
    if (!attached || !gameId) {
      post({
        type: "result",
        command: command.type,
        outcome: "ignored",
        reason: "notAttached",
      })

      return
    }

    if (!lecture) {
      post({
        type: "result",
        command: command.type,
        outcome: "ignored",
        reason: "notLecture",
      })

      return
    }

    const answer = (error: Error | null, outcome?: PollOutcome) => {
      reportPollOutcome(command, error, outcome)
    }
    const send = socket.timeout(ACK_TIMEOUT_MS)

    if (command.type === "startPoll") {
      send.emit(
        EVENTS.MANAGER.START_POLL,
        { gameId, poll: command.poll },
        answer,
      )

      return
    }

    // A deck's close or dismiss for a game this page no longer hosts (a
    // Restart since) changes nothing.
    if (command.gameId !== undefined && command.gameId !== gameId) {
      post({
        type: "result",
        command: command.type,
        outcome: "ignored",
        reason: "notCurrent",
      })

      return
    }

    const target = {
      gameId,
      ...(command.pollId === undefined ? {} : { pollId: command.pollId }),
    }

    if (command.type === "closePoll") {
      send.emit(EVENTS.MANAGER.CLOSE_POLL, target, answer)
    } else {
      send.emit(EVENTS.MANAGER.DISMISS_POLL, target, answer)
    }
  }

  // Only a poll that closed in the game this page hosts can be shown again.
  const showPollAgain = (id: string | null) => {
    const done =
      id === null || !attached
        ? undefined
        : (lecture?.pollsDone ?? []).find((entry) => entry.id === id)

    usePollStore.getState().setReview(done ?? null)
    useSoundStore
      .getState()
      .setSuppressed(
        isSilent(
          visibleNow.current,
          useManagerStore.getState().review,
          usePollStore.getState().snapshot !== null || done !== undefined,
        ),
      )
  }

  const runRound = (command: RoundCommand) => {
    const plan = planRoundCommand(command, {
      attached,
      lecture,
      screen: status?.name ?? null,
      pollShowing,
    })

    if (plan.kind === "queue") {
      settleQueued("superseded")
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

  // Leaving the game's page closes a lecture game this connection manages.
  const leaveGame = (quizId: string) => {
    forgetGame({ storage: localStorageOrNull(), quiz: quizId })
    settleQueued("closed")

    // A create already on the wire cannot be called back; its game is closed
    // when it is announced.
    if (createSentAt.current !== null) {
      abandonedCreateAt.current = Date.now()
    }

    createSentAt.current = null
    setEnsure(null)
    setPending(null)
    setAttached(false)
    setPlayers(0)

    if (pathname !== CONFIG_PATH) {
      navigate({ to: CONFIG_PATH, replace: true })
    }
  }

  // While the bridge asks to get back in, the server still counts the old,
  // dead connection as the manager and ignores a leave from this one: leaving
  // now would keep the room open for half an hour. So End quiz and Restart
  // quiz wait until this connection is back in. A later one replaces the one
  // held, and a lobby asked for after End quiz is a restart.
  const hold = (
    next: HeldCommand,
    command: "close" | "ensureGame",
    origin: string,
  ) => {
    held.current = next
    settleQueued("superseded", origin)
    setEnsure(null)
    setPending(null)
    post({ type: "result", command, outcome: "queued" }, origin)
  }

  const runHeld = () => {
    const next = held.current
    held.current = null

    if (!next) {
      return
    }

    if (next.type === "close") {
      leaveGame(next.quiz)
      post({ type: "result", command: "close", outcome: "accepted" })

      return
    }

    quiz.current = next.quiz
    setEnsure({ quiz: next.quiz, restart: "always" })
  }

  // Without the game back, a held command cannot close it. Forgetting it
  // means the next ensureGame starts a new game rather than chase this one.
  const dropHeld = () => {
    const next = held.current
    held.current = null

    if (!next) {
      return
    }

    leaveGame(next.quiz)
    post({
      type: "result",
      command: next.type === "close" ? "close" : "ensureGame",
      outcome: "ignored",
      reason: "reattachFailed",
    })
  }

  const handleCommand = (command: DeckCommand, origin: string) => {
    deckOriginRef.current = origin

    if (deckOrigin !== origin) {
      setDeckOrigin(origin)
    }

    if (command.type === "hello") {
      post({ type: "ready", state: stateRef.current }, origin)

      return
    }

    if (command.type === "ensureGame") {
      if (
        held.current ||
        (command.restart === "always" && retryTimer.current)
      ) {
        hold({ type: "restart", quiz: command.quiz }, "ensureGame", origin)

        return
      }

      quiz.current = command.quiz
      setEnsure({ quiz: command.quiz, restart: command.restart })

      return
    }

    if (command.type === "close") {
      if (retryTimer.current) {
        hold({ type: "close", quiz: command.quiz }, "close", origin)

        return
      }

      leaveGame(command.quiz)
      post({ type: "result", command: "close", outcome: "accepted" }, origin)

      return
    }

    if (command.type === "visibility") {
      visibleNow.current = command.visible
      setVisible(command.visible)
      useSoundStore
        .getState()
        .setSuppressed(
          isSilent(
            command.visible,
            useManagerStore.getState().review,
            usePollStore.getState().snapshot !== null,
          ),
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
        .setSuppressed(
          isSilent(
            visibleNow.current,
            question,
            usePollStore.getState().snapshot !== null,
          ),
        )

      return
    }

    if (command.type === "controls") {
      useManagerStore.getState().setHostControls(command.shown)

      return
    }

    if (command.type === "backdrop") {
      applyBackdrop(command.mode)

      return
    }

    // The deck's sound button. The new setting reaches the deck in the next
    // status, like any other change.
    if (command.type === "sound") {
      const sound = useSoundStore.getState()

      if (command.volume !== undefined) {
        sound.setVolume(command.volume)
      }

      if (command.muted !== undefined) {
        sound.setMuted(command.muted)
      }

      sound.unlock()

      return
    }

    if (command.type === "reviewPoll") {
      showPollAgain(command.id)

      return
    }

    if (isPollCommand(command)) {
      runPoll(command)

      return
    }

    runRound(command)
  }

  const handlerRef = useRef(handleCommand)

  useEffect(() => {
    handlerRef.current = handleCommand
    retryFailed.current = dropHeld
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
      } else if (isPollStart(event.data)) {
        // Answered to the origin the message came from: the deck's.
        post(
          { type: "error", code: "pollInvalid", command: "startPoll" },
          event.origin,
        )
      }
    }

    window.addEventListener("message", onMessage)

    return () => {
      window.removeEventListener("message", onMessage)
    }
    // `post` never changes, so the listener is added once.
  }, [post])

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
    useSoundStore
      .getState()
      .setSuppressed(isSilent(visible, review, pollOnScreen))
  }, [visible, review, pollOnScreen])

  // A result shown again belongs to its room: a new game, or a page no longer
  // attached, takes it away.
  useEffect(() => {
    if (!pollReview) {
      return
    }

    const stillDone =
      attached &&
      (lecture?.pollsDone ?? []).some((entry) => entry.id === pollReview.id)

    if (!stillDone) {
      usePollStore.getState().setReview(null)
    }
  }, [attached, gameId, lecture, pollReview])

  useEffect(() => {
    if (isConnected) {
      socket.emit(EVENTS.MANAGER.GET_CONFIG)
    } else {
      setAttached(false)
      // The created game would be announced to the connection that is gone.
      createSentAt.current = null
      abandonedCreateAt.current = null
    }
  }, [isConnected, socket])

  useEffect(
    () => () => {
      if (retryTimer.current) {
        clearInterval(retryTimer.current)
      }

      if (createTimer.current) {
        clearTimeout(createTimer.current)
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

  // Also the answer to a create the server refused after a restart wiped the
  // login: the host logs in again, then the create goes out again.
  useEvent(EVENTS.MANAGER.UNAUTHORIZED, () => {
    createSentAt.current = null
    abandonedCreateAt.current = null
    setLoggedIn(false)
  })

  useEvent(EVENTS.MANAGER.SUCCESS_RECONNECT, () => {
    setAttached(true)
    stopRetry()
    runHeld()
  })

  useEvent(EVENTS.MANAGER.GAME_CREATED, ({ gameId: createdId }) => {
    const abandonedAt = abandonedCreateAt.current
    abandonedCreateAt.current = null

    // The deck left before this game came back: it asked for none that is
    // still wanted, so close it rather than attach to it.
    if (abandonedAt !== null && Date.now() - abandonedAt < CREATE_TIMEOUT_MS) {
      socket.emit(EVENTS.MANAGER.LEAVE, { gameId: createdId })
      // After the page's own move to the new lobby.
      setTimeout(() => {
        navigate({ to: CONFIG_PATH, replace: true })
      }, 0)

      return
    }

    if (createSentAt.current !== null && quiz.current) {
      rememberGame({
        storage: localStorageOrNull(),
        quiz: quiz.current,
        gameId: createdId,
      })
      gameQuiz.current = { gameId: createdId, quiz: quiz.current }
    }

    createSentAt.current = null
    setPlayers(0)
    setAttached(true)
  })

  useEvent(EVENTS.GAME.TOTAL_PLAYERS, (count) => {
    setPlayers(count)
  })

  useEvent(EVENTS.GAME.ERROR_MESSAGE, (message) => {
    if (message === "errors:quizz.notFound") {
      abandonedCreateAt.current = null
    }

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
    // A gone game needs no closing: End quiz is done, Restart quiz goes on.
    runHeld()
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
      settleQueued("closed")
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
      const owner = gameQuiz.current
      // Hosting another quiz's game: this one cannot play that quiz's questions.
      const foreign = owner?.gameId === gameId && owner.quiz !== ensure.quiz

      if (lecture && !restart && !foreign) {
        gameQuiz.current = { gameId, quiz: ensure.quiz }

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

      if (foreign) {
        forgetGame({ storage, quiz: owner.quiz })
      }

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

      // If no answer comes, nothing else would run this check again.
      if (createTimer.current) {
        clearTimeout(createTimer.current)
      }

      createTimer.current = setTimeout(() => {
        createTimer.current = null
        setCreateCheck((count) => count + 1)
      }, CREATE_TIMEOUT_MS)
    }
  }, [
    attached,
    config,
    createCheck,
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
