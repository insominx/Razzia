import { EVENTS } from "@razzia/common/constants"
import type { Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import { STATUS, type StatusDataMap } from "@razzia/common/types/game/status"
import Game, {
  restampReconnectStatus,
  selectReconnectStatus,
} from "@razzia/socket/services/game"
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

    expect(reconnect?.status.name).toBe(STATUS.SHOW_RESPONSES)
    expect(reconnect?.players.map(({ username }) => username)).toEqual([
      "Alice",
      "Carol",
    ])
  })
})
