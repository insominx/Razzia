import { EVENTS } from "@razzia/common/constants"
import type { QuizzWithId } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import { gameSocketHandlers } from "@razzia/socket/handlers/game"
import { managerSocketHandlers } from "@razzia/socket/handlers/manager"
import { quizzSocketHandlers } from "@razzia/socket/handlers/quizz"
import { resultsSocketHandlers } from "@razzia/socket/handlers/results"
import type { SocketHandler } from "@razzia/socket/handlers/types"
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
  const socket = {
    id,
    handshake: { auth: { clientId } },
    emit: vi.fn(),
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

  return { socket, handlers }
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
