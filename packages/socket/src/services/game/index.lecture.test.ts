import { EVENTS, LECTURE_TEXT } from "@razzia/common/constants"
import type { GameResult, LectureState, Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import { STATUS } from "@razzia/common/types/game/status"
import Game from "@razzia/socket/services/game"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  saveResult: vi.fn<(_result: GameResult) => void>(),
}))

// Finishing or closing a game would otherwise write into config/results.
vi.mock("@razzia/socket/services/config", () => ({
  saveResult: mocks.saveResult,
}))

interface Emitted {
  target: string
  event: string
  payload: unknown
}

const createIo = () => {
  const emitted: Emitted[] = []
  const io = {
    to: vi.fn((target: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ target, event, payload })
      },
    })),
    in: vi.fn(() => ({ socketsLeave: vi.fn() })),
  } as unknown as Server

  return { io, emitted }
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

const lectureQuizz: Quizz = {
  subject: "Lecture",
  questions: [0, 1].map(() => ({
    question: "Pick one",
    answers: ["No", "Yes"],
    solutions: [1],
    cooldown: 1,
    time: 5,
  })),
}

const createGame = (lecture = true) => {
  const { io, emitted } = createIo()
  const manager = createClient("manager", "manager-client")
  const game = new Game({
    io,
    socket: manager.socket,
    quizz: lectureQuizz,
    visuals: {},
    lecture,
  })

  return { game, emitted, manager }
}

type Setup = ReturnType<typeof createGame>

// Nobody answers, so each question runs its short answer window out.
const playToResults = async (setup: Setup, index: number) => {
  expect(setup.game.playQuestion(setup.manager.socket, index)).toBe("accepted")
  await vi.advanceTimersByTimeAsync(60_000)
}

const sentTo = (emitted: Emitted[], target: string, event: string) =>
  emitted
    .filter((entry) => entry.target === target && entry.event === event)
    .map(({ payload }) => payload)

const findEvent = (
  emitted: Array<Omit<Emitted, "target">>,
  event: string,
): unknown => emitted.find((entry) => entry.event === event)?.payload

describe("Game lecture mode", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.saveResult.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("tells a lecture host which questions have run, and a normal host nothing extra", () => {
    const lecture = createGame()

    expect(
      findEvent(lecture.manager.emitted, EVENTS.MANAGER.GAME_CREATED),
    ).toMatchObject({
      lecture: {
        inviteCode: lecture.game.inviteCode,
        total: 2,
        played: [],
        current: null,
        finished: false,
      },
    })

    const normal = createGame(false)

    expect(
      findEvent(normal.manager.emitted, EVENTS.MANAGER.GAME_CREATED),
    ).not.toHaveProperty("lecture")
  })

  it("lets a newcomer in between questions with a wait screen that survives a reconnect", async () => {
    const setup = createGame()
    setup.game.join(createClient("p1", "alice-client").socket, "Alice")
    await playToResults(setup, 0)

    const late = createClient("p2", "bob-client")
    setup.game.join(late.socket, "Bobby")

    expect(findEvent(late.emitted, EVENTS.GAME.SUCCESS_JOIN)).toMatchObject({
      waitText: LECTURE_TEXT.NEXT_QUESTION,
    })
    expect(
      setup.game.players.find(({ username }) => username === "Bobby")?.points,
    ).toBe(0)

    setup.game.setPlayerDisconnected("p2")
    const back = createClient("p2-back", "bob-client")
    setup.game.reconnectPlayer(back.socket)

    expect(
      findEvent(back.emitted, EVENTS.PLAYER.SUCCESS_RECONNECT),
    ).toMatchObject({
      status: { name: STATUS.WAIT, data: { text: LECTURE_TEXT.NEXT_QUESTION } },
    })
  })

  it("turns a newcomer away while a question is running", async () => {
    const setup = createGame()
    setup.game.join(createClient("p1", "alice-client").socket, "Alice")
    setup.game.playQuestion(setup.manager.socket, 0)
    await vi.advanceTimersByTimeAsync(4_000)

    const late = createClient("p2", "bob-client")
    setup.game.join(late.socket, "Bobby")

    expect(late.emitted).toContainEqual({
      event: EVENTS.GAME.ERROR_MESSAGE,
      payload: "errors:game.questionInProgress",
    })
    expect(setup.game.players).toHaveLength(1)
  })

  it("resyncs a lecture host with the questions played", async () => {
    const setup = createGame()
    setup.game.join(createClient("p1", "alice-client").socket, "Alice")
    await playToResults(setup, 1)

    setup.game.setManagerDisconnected()
    const back = createClient("manager-2", "manager-client")
    setup.game.reconnectManager(back.socket)

    const reconnect = findEvent(
      back.emitted,
      EVENTS.MANAGER.SUCCESS_RECONNECT,
    ) as { lecture?: LectureState } | undefined

    expect(reconnect?.lecture).toMatchObject({ played: [1], current: 1 })
  })

  it("pushes the lecture state when a question starts and when the game finishes", async () => {
    const setup = createGame()
    setup.game.join(createClient("p1", "alice-client").socket, "Alice")
    await playToResults(setup, 0)

    // Once when the play is accepted (the countdown), once when it appears.
    expect(
      sentTo(setup.emitted, "manager", EVENTS.MANAGER.LECTURE_STATE),
    ).toEqual([
      expect.objectContaining({ played: [], current: 0 }),
      expect.objectContaining({ played: [0], finished: false }),
    ])

    expect(setup.game.finish(setup.manager.socket)).toBe("accepted")
    expect(
      sentTo(setup.emitted, "manager", EVENTS.MANAGER.LECTURE_STATE).at(-1),
    ).toMatchObject({ finished: true })
  })

  it("sends no lecture state to a host who has dropped", async () => {
    const setup = createGame()
    setup.game.join(createClient("p1", "alice-client").socket, "Alice")
    setup.game.playQuestion(setup.manager.socket, 0)
    const whileAttached = sentTo(
      setup.emitted,
      "manager",
      EVENTS.MANAGER.LECTURE_STATE,
    ).length
    setup.game.setManagerDisconnected()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(whileAttached).toBe(1)
    expect(
      sentTo(setup.emitted, "manager", EVENTS.MANAGER.LECTURE_STATE),
    ).toHaveLength(1)
  })

  it("saves a partial result once when an unfinished lecture closes", async () => {
    const setup = createGame()
    setup.game.join(createClient("p1", "alice-client").socket, "Alice")
    await playToResults(setup, 0)

    setup.game.close("errors:game.managerDisconnected")
    setup.game.close("errors:game.managerDisconnected")

    expect(mocks.saveResult).toHaveBeenCalledTimes(1)
    expect(mocks.saveResult).toHaveBeenCalledWith(
      expect.objectContaining({
        partial: true,
        questions: [expect.anything()],
      }),
    )
  })

  it("saves nothing when a lecture closes before its first question", () => {
    const setup = createGame()
    setup.game.join(createClient("p1", "alice-client").socket, "Alice")

    setup.game.close("errors:game.managerDisconnected")

    expect(mocks.saveResult).not.toHaveBeenCalled()
  })

  it("saves a finished lecture once, even when it closes afterwards", async () => {
    const setup = createGame()
    setup.game.join(createClient("p1", "alice-client").socket, "Alice")
    await playToResults(setup, 0)

    setup.game.finish(setup.manager.socket)
    setup.game.close("errors:game.managerDisconnected")

    expect(mocks.saveResult).toHaveBeenCalledTimes(1)
    expect(mocks.saveResult).toHaveBeenCalledWith(
      expect.not.objectContaining({ partial: true }),
    )
  })

  it("lets a lecture player's newest connection take over", () => {
    const setup = createGame()
    setup.game.join(createClient("p1", "alice-client").socket, "Alice")

    const second = createClient("p1-new", "alice-client")
    setup.game.reconnectPlayer(second.socket)

    expect(sentTo(setup.emitted, "p1", EVENTS.GAME.RESET)).toEqual([
      "errors:game.openedElsewhere",
    ])
    expect(second.emitted.map(({ event }) => event)).toContain(
      EVENTS.PLAYER.SUCCESS_RECONNECT,
    )
    expect(setup.game.players.map(({ id }) => id)).toEqual(["p1-new"])
  })

  it("still refuses a second connection in a normal game", () => {
    const setup = createGame(false)
    setup.game.join(createClient("p1", "alice-client").socket, "Alice")

    const second = createClient("p1-new", "alice-client")
    setup.game.reconnectPlayer(second.socket)

    expect(second.emitted).toContainEqual({
      event: EVENTS.GAME.RESET,
      payload: "errors:game.playerAlreadyConnected",
    })
    expect(setup.game.players.map(({ id }) => id)).toEqual(["p1"])
  })
})
