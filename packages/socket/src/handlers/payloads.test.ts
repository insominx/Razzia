import { EVENTS } from "@razzia/common/constants"
import type { QuizzWithId } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import { gameSocketHandlers } from "@razzia/socket/handlers/game"
import { managerSocketHandlers } from "@razzia/socket/handlers/manager"
import { quizzSocketHandlers } from "@razzia/socket/handlers/quizz"
import { resultsSocketHandlers } from "@razzia/socket/handlers/results"
import type { SocketHandler } from "@razzia/socket/handlers/types"
import * as config from "@razzia/socket/services/config"
import manager from "@razzia/socket/services/manager"
import Registry from "@razzia/socket/services/registry"
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

const mocks = vi.hoisted(() => {
  const quiz = {
    id: "quiz-1",
    subject: "Quiz",
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

  return { quiz }
})

// Nothing here may touch the real config files on disk.
vi.mock("@razzia/socket/services/config", () => ({
  getGameConfig: () => ({ managerPassword: "secret", visuals: {} }),
  getQuizz: (): QuizzWithId[] => [mocks.quiz],
  getQuizzMeta: () => [],
  getResultsMeta: () => [],
  getQuizzById: vi.fn(() => mocks.quiz),
  getResultById: vi.fn(),
  saveQuizz: vi.fn(() => ({ id: "saved" })),
  updateQuizz: vi.fn(() => ({ id: "quiz-1" })),
  deleteQuizz: vi.fn(() => ({ id: "quiz-1" })),
  restoreCommittedQuizz: vi.fn(() => ({ id: "quiz-1" })),
  deleteResult: vi.fn(),
  updateGameConfig: vi.fn(),
  saveResult: vi.fn(),
}))

vi.mock("@razzia/socket/services/visuals", () => ({
  resolveVisuals: () => ({}),
  setGlobalBackground: vi.fn(),
  clearGlobalBackground: vi.fn(),
  finalizeBackgroundMutation: vi.fn(),
}))

type Handler = (...args: unknown[]) => unknown

const socketHandlers: SocketHandler[] = [
  managerSocketHandlers,
  quizzSocketHandlers,
  gameSocketHandlers,
  resultsSocketHandlers,
]

const io = {
  to: vi.fn(() => ({ emit: vi.fn() })),
  in: vi.fn(() => ({ socketsLeave: vi.fn() })),
} as unknown as Server

// A client's socket, with every real handler registered on it.
const connect = (id: string, clientId: string) => {
  const handlers = new Map<string, Handler>()
  const emit = vi.fn()
  const socket = {
    id,
    handshake: { auth: { clientId } },
    emit,
    join: vi.fn(),
    to: vi.fn(() => ({ emit: vi.fn() })),
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler)

      return socket
    }),
  } as unknown as Socket

  socketHandlers.forEach((register) => {
    register({ io, socket })
  })

  return { socket, handlers, emit }
}

const events = [...connect("probe", "probe-client").handlers.keys()]

// Everything a stranger's client could send in place of a real payload.
const malformed = (gameId: string): unknown[][] => [
  [],
  [undefined],
  [null],
  [{}],
  [42],
  ["text"],
  [true],
  [[]],
  [() => undefined],
  [{ gameId: 42 }],
  [{ gameId: null }],
  [{ gameId }, "not a function"],
  [{ gameId, data: null }],
  [{ gameId, data: 42 }],
  [{ gameId, data: {} }],
  [{ gameId, data: { username: 42, answerKey: "1" } }],
  [{ gameId, playerId: 42 }],
  [{ gameId, playerId: null }, 42],
  [{ gameId, index: "1" }, 42],
  [{ gameId, index: null }, null],
  [{ id: 42 }],
  [{ background: null }, "not a function"],
  [null, 42],
  [{ dialect: 1, soundTheme: [], showIntensity: {} }, {}],
]

const registry = Registry.getInstance()

const clearGames = () => {
  registry.getAllGames().forEach(({ gameId }) => {
    registry.removeGame(gameId)
  })
}

// A logged-in host's game, with a stranger already playing in it.
const hostGame = (lecture: boolean) => {
  const host = connect("manager", "manager-client")
  const stranger = connect("stranger", "stranger-client")

  manager.login(host.socket)
  host.handlers.get(
    lecture ? EVENTS.GAME.CREATE_LECTURE : EVENTS.GAME.CREATE,
  )?.("quiz-1")
  const [game] = registry.getAllGames()
  game.join(stranger.socket, "Stranger")

  return { game, clients: { manager: host, stranger } }
}

// Sends every kind of junk to one event, from the host and from a stranger,
// with a fresh game each time: some junk still names a real game. A start
// still runs its countdown, so a promise is kept to check once it is over.
const sendJunk = (event: string, lecture: boolean) => {
  const failures: Array<[label: string, error: unknown]> = []
  const pending: Array<Promise<unknown>> = []

  for (const role of ["manager", "stranger"] as const) {
    for (let index = 0; index < malformed("").length; index += 1) {
      const { game, clients } = hostGame(lecture)
      const args = malformed(game.gameId)[index]
      const label = `${role} sent ${JSON.stringify(args)}`

      try {
        const result = clients[role].handlers.get(event)?.(...args)

        if (result instanceof Promise) {
          pending.push(
            result.catch((error: unknown) => failures.push([label, error])),
          )
        }
      } catch (error) {
        failures.push([label, error])
      }

      clearGames()
    }
  }

  return { failures, pending }
}

describe("socket handlers given a missing or malformed payload", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, "log").mockImplementation(() => undefined)
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    clearGames()
    manager.logout(connect("manager", "manager-client").socket)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  afterAll(() => {
    registry.stopCleanupTask()
  })

  it("registers the events this suite sends junk to", () => {
    expect(events).toEqual(
      expect.arrayContaining([
        EVENTS.PLAYER.RECONNECT,
        EVENTS.PLAYER.LOGIN,
        EVENTS.PLAYER.SELECTED_ANSWER,
        EVENTS.MANAGER.RECONNECT,
        EVENTS.MANAGER.KICK_PLAYER,
        EVENTS.MANAGER.PLAY_QUESTION,
        EVENTS.MANAGER.GLOBAL_BACKGROUND_SET,
        EVENTS.QUIZZ.UPDATE,
        EVENTS.RESULTS.DELETE,
      ]),
    )
  })

  describe.each([
    { kind: "game", lecture: false },
    { kind: "lecture game", lecture: true },
  ])("in a $kind", ({ lecture }) => {
    it.each(events)(
      "%s ignores junk from a logged-in host and from a stranger",
      async (event) => {
        const { failures, pending } = sendJunk(event, lecture)

        await vi.advanceTimersByTimeAsync(60_000)
        await Promise.all(pending)

        expect(failures).toEqual([])
      },
    )
  })
})

// What a client may not do without being the host. These send well-formed
// payloads, so only an authorization check can stop them.
describe("socket handlers given a well-formed request from the wrong client", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, "log").mockImplementation(() => undefined)
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.clearAllMocks()
  })

  afterEach(() => {
    clearGames()
    manager.logout(connect("manager", "manager-client").socket)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("turns every manager event away from a client that never logged in", () => {
    const outsider = connect("outsider", "outsider-client")
    const quizzData = { subject: "x", questions: [] }
    const requests: Array<[string, unknown[]]> = [
      [EVENTS.MANAGER.GET_CONFIG, []],
      [EVENTS.MANAGER.GLOBAL_BACKGROUND_SET, [{ background: null }]],
      [EVENTS.MANAGER.GLOBAL_BACKGROUND_CLEAR, []],
      [EVENTS.MANAGER.DIALECT_SET, [{ dialect: "stage-studio" }]],
      [EVENTS.MANAGER.SOUND_THEME_SET, [{ soundTheme: "techno" }]],
      [EVENTS.MANAGER.SHOW_INTENSITY_SET, [{ showIntensity: "calm" }]],
      [EVENTS.QUIZZ.GET, ["quiz-1"]],
      [EVENTS.QUIZZ.SAVE, [quizzData]],
      [EVENTS.QUIZZ.UPDATE, [{ id: "quiz-1", ...quizzData }]],
      [EVENTS.QUIZZ.DELETE, ["quiz-1"]],
      [EVENTS.RESULTS.GET, ["result-1"]],
      [EVENTS.RESULTS.DELETE, ["result-1"]],
      [EVENTS.GAME.CREATE, ["quiz-1"]],
      [EVENTS.GAME.CREATE_LECTURE, ["quiz-1"]],
    ]

    for (const [event, args] of requests) {
      const { emit } = outsider
      emit.mockClear()

      outsider.handlers.get(event)?.(...args)

      expect(emit, event).toHaveBeenCalledWith(EVENTS.MANAGER.UNAUTHORIZED)
    }

    expect(registry.getAllGames()).toEqual([])
    expect(config.saveQuizz).not.toHaveBeenCalled()
    expect(config.updateQuizz).not.toHaveBeenCalled()
    expect(config.deleteQuizz).not.toHaveBeenCalled()
    expect(config.deleteResult).not.toHaveBeenCalled()
    expect(config.updateGameConfig).not.toHaveBeenCalled()
  })

  it.each([
    { kind: "game", lecture: false },
    { kind: "lecture game", lecture: true },
  ])(
    "leaves a $kind untouched when a stranger sends host commands",
    ({ lecture }) => {
      const { game } = hostGame(lecture)
      const intruder = connect("intruder", "intruder-client")
      const phaseBefore = game.inLobby
      const ack = vi.fn<(outcome: unknown) => void>()
      const commands: Array<[string, unknown[]]> = [
        [
          EVENTS.MANAGER.KICK_PLAYER,
          [{ gameId: game.gameId, playerId: "stranger" }],
        ],
        [EVENTS.MANAGER.START_GAME, [{ gameId: game.gameId }]],
        [EVENTS.MANAGER.NEXT_QUESTION, [{ gameId: game.gameId }]],
        [EVENTS.MANAGER.ABORT_QUIZ, [{ gameId: game.gameId }]],
        [EVENTS.MANAGER.UNLOCK_ANSWERS, [{ gameId: game.gameId }]],
        [EVENTS.MANAGER.SHOW_LEADERBOARD, [{ gameId: game.gameId }]],
        [
          EVENTS.MANAGER.PLAY_QUESTION,
          [{ gameId: game.gameId, index: 0 }, ack],
        ],
        [EVENTS.MANAGER.FINISH_GAME, [{ gameId: game.gameId }, ack]],
      ]

      for (const [event, args] of commands) {
        intruder.handlers.get(event)?.(...args)
      }

      expect(game.players.map(({ username }) => username)).toEqual(["Stranger"])
      expect(game.inLobby).toBe(phaseBefore)
      expect(game.manager.id).toBe("manager")
      expect(registry.getAllGames()).toEqual([game])
      expect(intruder.emit).not.toHaveBeenCalledWith(
        EVENTS.GAME.RESET,
        expect.anything(),
      )

      if (lecture) {
        expect(ack.mock.calls.map(([outcome]) => outcome)).toEqual([
          "notManager",
          "notManager",
        ])
      }
    },
  )

  it("does not hand a manager's game to a client that is not its manager", () => {
    const { game } = hostGame(false)
    const intruder = connect("intruder", "intruder-client")
    manager.login(intruder.socket)

    intruder.handlers.get(EVENTS.MANAGER.RECONNECT)?.({ gameId: game.gameId })

    expect(game.manager.id).toBe("manager")
    expect(intruder.emit).toHaveBeenCalledWith(
      EVENTS.GAME.RESET,
      "errors:game.expired",
    )
    manager.logout(intruder.socket)
  })
})
