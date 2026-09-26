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

    game.join(createClient("p2", "carol-client").socket, "Carol")
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
    game.reconnect(back.socket)
    const reconnect = back.emitted.find(
      ({ event }) => event === EVENTS.MANAGER.SUCCESS_RECONNECT,
    )?.payload as
      | { status: { name: string }; players: Array<{ username: string }> }
      | undefined

    expect(JSON.stringify(back.emitted)).not.toContain("alice-client")
    expect(reconnect?.status.name).toBe(STATUS.SHOW_RESPONSES)
    expect(reconnect?.players.map(({ username }) => username)).toEqual([
      "Alice",
      "Carol",
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
    game.reconnect(back.socket)
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
    lookup.mockRestore()
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
  it("resyncs the attached manager and still refuses another tab", () => {
    const manager = createClient("manager", "manager-client")
    const game = new Game({
      io: createIo().io,
      socket: manager.socket,
      quizz: awayQuizz,
      visuals: {},
    })
    const otherTab = createClient("manager-tab-2", "manager-client")

    game.reconnect(manager.socket)
    game.reconnect(otherTab.socket)

    expect(manager.emitted.map(({ event }) => event)).toContain(
      EVENTS.MANAGER.SUCCESS_RECONNECT,
    )
    expect(otherTab.emitted).toContainEqual({
      event: EVENTS.GAME.RESET,
      payload: "errors:game.managerAlreadyConnected",
    })
  })

  it("resyncs the attached player and still refuses another tab", () => {
    const game = new Game({
      io: createIo().io,
      socket: createClient("manager", "manager-client").socket,
      quizz: awayQuizz,
      visuals: {},
    })
    const alice = createClient("p1", "alice-client")
    const otherTab = createClient("p1-tab-2", "alice-client")
    game.join(alice.socket, "Alice")

    game.reconnect(alice.socket)
    game.reconnect(otherTab.socket)

    expect(alice.emitted.map(({ event }) => event)).toContain(
      EVENTS.PLAYER.SUCCESS_RECONNECT,
    )
    expect(otherTab.emitted).toContainEqual({
      event: EVENTS.GAME.RESET,
      payload: "errors:game.playerAlreadyConnected",
    })
  })
})
