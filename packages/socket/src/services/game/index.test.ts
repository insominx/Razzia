import { EVENTS, NO_TIME_LIMIT } from "@razzia/common/constants"
import type { Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import { STATUS, type StatusDataMap } from "@razzia/common/types/game/status"
import Game, {
  restampReconnectStatus,
  selectReconnectStatus,
} from "@razzia/socket/services/game"
import Registry from "@razzia/socket/services/registry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const selectAnswerStatus: {
  name: typeof STATUS.SELECT_ANSWER
  data: StatusDataMap["SELECT_ANSWER"]
} = {
  name: STATUS.SELECT_ANSWER,
  data: {
    question: "Question",
    questionNumber: 1,
    answers: ["A", "B"],
    time: 10,
    totalPlayer: 2,
    revealStartedAt: 1_000,
    unlockAt: 5_000,
    serverNow: 1_100,
    answeringOpen: false,
  },
}

describe("reconnect status selection", () => {
  it("preserves a per-socket WAIT instead of promoting the room reveal", () => {
    const wait = {
      name: STATUS.WAIT,
      data: { text: "game:waitingForAnswers" },
    } as const

    expect(selectReconnectStatus(wait, selectAnswerStatus)).toBe(wait)
  })

  it("falls back to the room status and finally to WAIT", () => {
    expect(selectReconnectStatus(undefined, selectAnswerStatus)).toBe(
      selectAnswerStatus,
    )
    expect(selectReconnectStatus(undefined, undefined)).toEqual({
      name: STATUS.WAIT,
      data: { text: "game:waitingForPlayers" },
    })
  })
})

const showQuestionStatus: {
  name: typeof STATUS.SHOW_QUESTION
  data: StatusDataMap["SHOW_QUESTION"]
} = {
  name: STATUS.SHOW_QUESTION,
  data: {
    question: "Setup one. Why?",
    questionNumber: 1,
    cooldown: 5,
    promptStartedAt: 1_000,
    serverNow: 1_100,
  },
}

describe("restampReconnectStatus", () => {
  it("clones SELECT_ANSWER and refreshes only serverNow", () => {
    const restamped = restampReconnectStatus(selectAnswerStatus, 1_800)

    expect(restamped).not.toBe(selectAnswerStatus)
    expect(restamped.data).not.toBe(selectAnswerStatus.data)
    expect(restamped).toEqual({
      ...selectAnswerStatus,
      data: { ...selectAnswerStatus.data, serverNow: 1_800 },
    })
    expect(selectAnswerStatus.data.serverNow).toBe(1_100)
  })

  it("clones SHOW_QUESTION and refreshes only serverNow", () => {
    const restamped = restampReconnectStatus(showQuestionStatus, 1_800)

    expect(restamped).not.toBe(showQuestionStatus)
    expect(restamped.data).not.toBe(showQuestionStatus.data)
    expect(restamped).toEqual({
      ...showQuestionStatus,
      data: { ...showQuestionStatus.data, serverNow: 1_800 },
    })
    expect(showQuestionStatus.data.serverNow).toBe(1_100)
  })

  it("refreshes serverNow on the staged verdict, so a reconnect lands at the right beat", () => {
    const result: {
      name: typeof STATUS.SHOW_RESULT
      data: StatusDataMap["SHOW_RESULT"]
    } = {
      name: STATUS.SHOW_RESULT,
      data: {
        correct: true,
        message: "game:correct",
        points: 840,
        myPoints: 9_640,
        rank: 1,
        aheadOfMe: null,
        resultsAt: 5_000,
        serverNow: 5_000,
      },
    }
    const responses: {
      name: typeof STATUS.SHOW_RESPONSES
      data: StatusDataMap["SHOW_RESPONSES"]
    } = {
      name: STATUS.SHOW_RESPONSES,
      data: {
        questionNumber: 1,
        question: "Which?",
        responses: { 0: 3 },
        solutions: [0],
        answers: ["A", "B"],
        resultsAt: 5_000,
        serverNow: 5_000,
      },
    }

    for (const status of [result, responses]) {
      const restamped = restampReconnectStatus(status, 7_250)

      expect(restamped).not.toBe(status)
      expect(restamped.data).toMatchObject({
        resultsAt: 5_000,
        serverNow: 7_250,
      })
      expect(status.data.serverNow).toBe(5_000)
    }
  })

  it("leaves WAIT selected and unchanged", () => {
    const wait = {
      name: STATUS.WAIT,
      data: { text: "game:waitingForAnswers" },
    } as const

    expect(restampReconnectStatus(wait, 1_800)).toBe(wait)
  })
})

interface Emitted {
  target: string
  event: string
  payload: unknown
}

const createIo = () => {
  const emitted: Emitted[] = []
  const socketsLeave = vi.fn()
  const io = {
    to: vi.fn((target: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ target, event, payload })
      },
    })),
    in: vi.fn((target: string) => ({
      socketsLeave: (room: string) => {
        socketsLeave(target, room)
      },
    })),
  } as unknown as Server

  return { io, emitted, socketsLeave }
}

const createClient = (id: string, clientId: string) => {
  const emitted: Array<Omit<Emitted, "target">> = []
  const socket = {
    id,
    handshake: { auth: { clientId } },
    join: vi.fn(),
    emit: vi.fn((event: string, payload: unknown) => {
      emitted.push({ event, payload })
    }),
    to: vi.fn(() => ({ emit: vi.fn() })),
  } as unknown as Socket

  return { socket, emitted }
}

const awayQuizz: Quizz = {
  subject: "Away",
  questions: [
    {
      question: "Pick one",
      answers: ["No", "Yes"],
      solutions: [1],
      cooldown: 1,
      time: 5,
    },
  ],
}

describe("Game while its manager is away", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("stops addressing the manager socket and replays the round on return", async () => {
    const { io, emitted, socketsLeave } = createIo()
    const manager = createClient("manager", "manager-client")
    const game = new Game({
      io,
      socket: manager.socket,
      quizz: awayQuizz,
      visuals: {},
    })
    game.join(createClient("p1", "alice-client").socket, "Alice")
    void game.start(manager.socket)

    game.setManagerDisconnected()
    expect(socketsLeave).toHaveBeenCalledWith("manager", game.gameId)
    emitted.length = 0

    await vi.advanceTimersByTimeAsync(60_000)

    expect(emitted.filter(({ target }) => target === "manager")).toEqual([])
    expect(
      emitted
        .filter(
          ({ target, event }) =>
            target === "p1" && event === EVENTS.GAME.STATUS,
        )
        .map(({ payload }) => (payload as { name: string }).name),
    ).toContain(STATUS.SHOW_RESULT)

    const back = createClient("manager-2", "manager-client")
    game.reconnectManager(back.socket)
    const reconnect = back.emitted.find(
      ({ event }) => event === EVENTS.MANAGER.SUCCESS_RECONNECT,
    )?.payload as
      | { status: { name: string }; players: Array<{ username: string }> }
      | undefined

    expect(JSON.stringify(back.emitted)).not.toContain("alice-client")
    expect(reconnect?.status.name).toBe(STATUS.SHOW_RESPONSES)
    expect(reconnect?.players.map(({ username }) => username)).toEqual([
      "Alice",
    ])
  })
})

describe("Game while a player is away", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("stops addressing the player's socket and replays their result on return", async () => {
    const { io, emitted, socketsLeave } = createIo()
    const manager = createClient("manager", "manager-client")
    const game = new Game({
      io,
      socket: manager.socket,
      quizz: awayQuizz,
      visuals: {},
    })
    game.join(createClient("p1", "alice-client").socket, "Alice")
    game.join(createClient("p2", "bob-client").socket, "Bobby")
    void game.start(manager.socket)

    game.setPlayerDisconnected("p1")
    expect(socketsLeave).toHaveBeenCalledWith("p1", game.gameId)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(emitted.filter(({ target }) => target === "p1")).toEqual([])
    expect(emitted.some(({ target }) => target === "p2")).toBe(true)

    const back = createClient("p1-again", "alice-client")
    game.reconnectPlayer(back.socket)
    const reconnect = back.emitted.find(
      ({ event }) => event === EVENTS.PLAYER.SUCCESS_RECONNECT,
    )?.payload as { status: { name: string } } | undefined

    expect(reconnect?.status.name).toBe(STATUS.SHOW_RESULT)
  })
})

describe("Game player privacy", () => {
  it("announces new players to the manager without their clientId", () => {
    const { io, emitted } = createIo()
    const manager = createClient("manager", "manager-client")
    const game = new Game({
      io,
      socket: manager.socket,
      quizz: awayQuizz,
      visuals: {},
    })

    game.join(createClient("p1", "alice-client").socket, "Alice")

    const announced = emitted.find(
      ({ target, event }) =>
        target === "manager" && event === EVENTS.MANAGER.NEW_PLAYER,
    )
    expect(announced?.payload).toMatchObject({ id: "p1", username: "Alice" })
    expect(announced?.payload).not.toHaveProperty("clientId")
  })
})

describe("Game invite codes", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("never reuses the invite code of a live game", () => {
    const lookup = vi
      .spyOn(Registry.getInstance(), "getGameByInviteCode")
      .mockReturnValueOnce({} as Game)
    const game = new Game({
      io: createIo().io,
      socket: createClient("manager", "manager-client").socket,
      quizz: awayQuizz,
      visuals: {},
    })

    expect(lookup).toHaveBeenCalledTimes(2)
    expect(lookup).toHaveBeenLastCalledWith(game.inviteCode)
  })
})

describe("Game closing", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("resets everyone still in the game and stops its clock", async () => {
    const { io, emitted, socketsLeave } = createIo()
    const manager = createClient("manager", "manager-client")
    const game = new Game({
      io,
      socket: manager.socket,
      quizz: {
        subject: "Untimed",
        questions: [{ ...awayQuizz.questions[0], time: NO_TIME_LIMIT }],
      },
      visuals: {},
    })
    game.join(createClient("p1", "alice-client").socket, "Alice")
    void game.start(manager.socket)
    await vi.advanceTimersByTimeAsync(60_000)
    emitted.length = 0

    game.close("errors:game.managerDisconnected")
    await vi.advanceTimersByTimeAsync(60_000)

    expect(emitted).toEqual([
      {
        target: game.gameId,
        event: EVENTS.GAME.RESET,
        payload: "errors:game.managerDisconnected",
      },
    ])
    expect(socketsLeave).toHaveBeenCalledWith(game.gameId, game.gameId)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("Game reconnect from an attached socket", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("resyncs a lobby to its invite code, then to the running game", () => {
    const manager = createClient("manager", "manager-client")
    const game = new Game({
      io: createIo().io,
      socket: manager.socket,
      quizz: awayQuizz,
      visuals: {},
    })
    const statusOnResync = () => {
      manager.emitted.length = 0
      game.reconnectManager(manager.socket)

      return (
        manager.emitted.find(
          ({ event }) => event === EVENTS.MANAGER.SUCCESS_RECONNECT,
        )?.payload as { status: { name: string; data: unknown } } | undefined
      )?.status
    }

    expect(statusOnResync()).toEqual({
      name: STATUS.SHOW_ROOM,
      data: { text: "game:waitingForPlayers", inviteCode: game.inviteCode },
    })

    game.join(createClient("p1", "alice-client").socket, "Alice")
    void game.start(manager.socket)

    expect(statusOnResync()?.name).toBe(STATUS.SHOW_START)
  })

  it("resyncs the attached manager and lets the newest connection take over", () => {
    const manager = createClient("manager", "manager-client")
    const game = new Game({
      io: createIo().io,
      socket: manager.socket,
      quizz: awayQuizz,
      visuals: {},
    })
    const otherTab = createClient("manager-tab-2", "manager-client")

    game.reconnectManager(manager.socket)
    game.reconnectManager(otherTab.socket)

    expect(manager.emitted.map(({ event }) => event)).toContain(
      EVENTS.MANAGER.SUCCESS_RECONNECT,
    )
    expect(otherTab.emitted.map(({ event }) => event)).toContain(
      EVENTS.MANAGER.SUCCESS_RECONNECT,
    )
    expect(otherTab.emitted).not.toContainEqual(
      expect.objectContaining({ event: EVENTS.GAME.RESET }),
    )
    expect(game.manager.id).toBe("manager-tab-2")
  })

  it("resyncs the attached player and lets the newest connection take over", () => {
    const game = new Game({
      io: createIo().io,
      socket: createClient("manager", "manager-client").socket,
      quizz: awayQuizz,
      visuals: {},
    })
    const alice = createClient("p1", "alice-client")
    const otherTab = createClient("p1-tab-2", "alice-client")
    game.join(alice.socket, "Alice")

    game.reconnectPlayer(alice.socket)
    game.reconnectPlayer(otherTab.socket)

    expect(alice.emitted.map(({ event }) => event)).toContain(
      EVENTS.PLAYER.SUCCESS_RECONNECT,
    )
    expect(otherTab.emitted.map(({ event }) => event)).toContain(
      EVENTS.PLAYER.SUCCESS_RECONNECT,
    )
    expect(otherTab.emitted).not.toContainEqual(
      expect.objectContaining({ event: EVENTS.GAME.RESET }),
    )
    expect(game.players.map(({ id }) => id)).toEqual(["p1-tab-2"])
  })
})

describe("Game membership", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("takes a player who leaves the lobby out of the game's room", () => {
    const { io, socketsLeave } = createIo()
    const game = new Game({
      io,
      socket: createClient("manager", "manager-client").socket,
      quizz: awayQuizz,
      visuals: {},
    })
    game.join(createClient("p1", "alice-client").socket, "Alice")

    game.removePlayer("p1")

    expect(socketsLeave).toHaveBeenCalledWith("p1", game.gameId)
  })

  it("does not reset the socket of a kicked player who already left", () => {
    const { io, emitted } = createIo()
    const manager = createClient("manager", "manager-client")
    const game = new Game({
      io,
      socket: manager.socket,
      quizz: awayQuizz,
      visuals: {},
    })
    game.join(createClient("p1", "alice-client").socket, "Alice")
    game.setPlayerDisconnected("p1")
    emitted.length = 0

    game.kickPlayer(manager.socket, "p1")

    expect(emitted.filter(({ target }) => target === "p1")).toEqual([])
    expect(manager.emitted).toContainEqual({
      event: EVENTS.MANAGER.PLAYER_KICKED,
      payload: "p1",
    })
  })

  it("only lets the attached manager socket run the game", () => {
    const { io, emitted } = createIo()
    const manager = createClient("manager", "manager-client")
    const game = new Game({
      io,
      socket: manager.socket,
      quizz: awayQuizz,
      visuals: {},
    })
    game.join(createClient("p1", "alice-client").socket, "Alice")
    game.setManagerDisconnected()

    void game.start(manager.socket)
    expect(game.started).toBe(false)

    game.reconnectManager(manager.socket)
    void game.start(manager.socket)
    expect(game.started).toBe(true)
    expect(emitted.map(({ event }) => event)).toContain(EVENTS.GAME.STATUS)
  })
})

describe("Game joining", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("turns away new players once the game has started", () => {
    const manager = createClient("manager", "manager-client")
    const game = new Game({
      io: createIo().io,
      socket: manager.socket,
      quizz: awayQuizz,
      visuals: {},
    })
    game.join(createClient("p1", "alice-client").socket, "Alice")
    void game.start(manager.socket)

    const late = createClient("p2", "bob-client")
    game.join(late.socket, "Bobby")

    expect(late.emitted).toEqual([
      {
        event: EVENTS.GAME.ERROR_MESSAGE,
        payload: "errors:game.alreadyStarted",
      },
    ])
    expect(game.players.map(({ username }) => username)).toEqual(["Alice"])
  })

  it("lets a host who also plays from another tab rejoin as that player", () => {
    const host = createClient("host", "host-client")
    const game = new Game({
      io: createIo().io,
      socket: host.socket,
      quizz: awayQuizz,
      visuals: {},
    })
    game.join(createClient("host-tab", "host-client").socket, "Hosty")
    void game.start(host.socket)
    game.setPlayerDisconnected("host-tab")

    const back = createClient("host-tab-2", "host-client")
    game.reconnectPlayer(back.socket)

    expect(back.emitted.map(({ event }) => event)).toContain(
      EVENTS.PLAYER.SUCCESS_RECONNECT,
    )
  })
})

describe("Game with a player who drops out", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("ends the answers once the grace for a dropped player runs out", async () => {
    const { io, emitted } = createIo()
    const manager = createClient("manager", "manager-client")
    const game = new Game({
      io,
      socket: manager.socket,
      quizz: {
        subject: "Dropout",
        questions: [{ ...awayQuizz.questions[0], time: 60 }],
      },
      visuals: {},
    })
    const alice = createClient("p1", "alice-client")
    const bobby = createClient("p2", "bob-client")
    game.join(alice.socket, "Alice")
    game.join(bobby.socket, "Bobby")
    game.join(createClient("p3", "carol-client").socket, "Carol")
    void game.start(manager.socket)
    const answeringOpen = () =>
      emitted.some(
        ({ event, payload }) =>
          event === EVENTS.GAME.STATUS &&
          (payload as { data: { answeringOpen?: boolean } }).data
            .answeringOpen === true,
      )

    await vi.advanceTimersByTimeAsync(20_000)
    expect(answeringOpen()).toBe(true)
    const responses = () =>
      emitted.filter(
        ({ target, payload }) =>
          target === "manager" &&
          (payload as { name: string }).name === STATUS.SHOW_RESPONSES,
      )

    game.setPlayerDisconnected("p3")
    game.selectAnswer(alice.socket, 1)
    game.selectAnswer(bobby.socket, 1)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(responses()).toEqual([])

    await vi.advanceTimersByTimeAsync(6_000)
    expect(responses()).toHaveLength(1)
  })
})

describe("Game host controls", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const lobby = () => {
    const { io, emitted } = createIo()
    const manager = createClient("manager", "manager-client")
    const game = new Game({
      io,
      socket: manager.socket,
      quizz: {
        subject: "Controls",
        questions: [{ ...awayQuizz.questions[0], time: 60 }],
      },
      visuals: {},
    })
    const alice = createClient("p1", "alice-client")
    const bobby = createClient("p2", "bobby-client")

    game.join(alice.socket, "Alice")
    game.join(bobby.socket, "Bobby")

    return { game, emitted, manager, alice, bobby }
  }

  it("ignores start and kick from a player or a stranger", () => {
    const { game, emitted, alice } = lobby()
    const stranger = createClient("stranger", "stranger-client")
    emitted.length = 0

    for (const socket of [alice.socket, stranger.socket]) {
      void game.start(socket)
      game.kickPlayer(socket, "p2")
    }

    expect(game.started).toBe(false)
    expect(game.players.map(({ username }) => username)).toEqual([
      "Alice",
      "Bobby",
    ])
    expect(emitted).toEqual([])
  })

  it("ignores abort from a player and from the host's old socket", async () => {
    const { game, emitted, manager, alice } = lobby()
    void game.start(manager.socket)
    await vi.advanceTimersByTimeAsync(20_000)
    const statuses = () =>
      emitted.filter(
        ({ payload }) =>
          (payload as { name?: string } | undefined)?.name ===
          STATUS.SHOW_RESPONSES,
      )

    game.abortRound(alice.socket)
    expect(statuses()).toEqual([])

    game.setManagerDisconnected()
    game.abortRound(manager.socket)
    game.kickPlayer(manager.socket, "p2")

    expect(statuses()).toEqual([])
    expect(game.players).toHaveLength(2)
    expect(emitted.map(({ event }) => event)).not.toContain(
      EVENTS.MANAGER.PLAYER_KICKED,
    )
  })

  it("starts no timers when the game closes during the start screen", async () => {
    const { game, emitted, manager } = lobby()
    void game.start(manager.socket)

    game.close("errors:game.managerDisconnected")
    await vi.advanceTimersByTimeAsync(10_000)

    expect(emitted.map(({ event }) => event)).not.toContain(
      EVENTS.GAME.START_COOLDOWN,
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not let a kicked player back into the lobby", () => {
    const { game, manager } = lobby()

    game.kickPlayer(manager.socket, "p1")
    const back = createClient("p1-again", "alice-client")
    game.join(back.socket, "Alice2")

    expect(game.isKicked("alice-client")).toBe(true)
    expect(back.emitted).toEqual([
      {
        event: EVENTS.GAME.ERROR_MESSAGE,
        payload: "errors:game.kickedByManager",
      },
    ])
    expect(game.players.map(({ username }) => username)).toEqual(["Bobby"])
  })
})

describe("Game hardening", () => {
  const lobby = () => {
    const { io, emitted } = createIo()
    const manager = createClient("manager", "manager-client")
    const game = new Game({
      io,
      socket: manager.socket,
      quizz: {
        subject: "Controls",
        questions: [{ ...awayQuizz.questions[0], time: 60 }],
      },
      visuals: {},
    })

    return { game, emitted, manager }
  }

  it("takes no more than 200 players, however many client ids a script invents", () => {
    const { game } = lobby()

    for (let i = 0; i < 200; i += 1) {
      game.join(createClient(`s${i}`, `c${i}`).socket, `player-${i}`)
    }

    const late = createClient("late", "late-client")
    game.join(late.socket, "latecomer")

    expect(game.players).toHaveLength(200)
    expect(late.emitted).toEqual([
      { event: EVENTS.GAME.ERROR_MESSAGE, payload: "errors:game.full" },
    ])
  })

  it("ignores a disconnect from a socket no player holds", () => {
    const { game, emitted } = lobby()
    game.join(createClient("p1", "alice-client").socket, "Alice")
    const before = emitted.length

    game.setPlayerDisconnected("stale-socket")

    expect(game.players[0].connected).toBe(true)
    expect(emitted).toHaveLength(before)
  })
})
