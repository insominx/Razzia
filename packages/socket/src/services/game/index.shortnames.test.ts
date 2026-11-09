import { EVENTS } from "@razzia/common/constants"
import type { Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import Game from "@razzia/socket/services/game"
import { describe, expect, it, vi } from "vitest"

interface Emitted {
  event: string
  payload: unknown
}

const createIo = () =>
  ({
    to: vi.fn(() => ({ emit: vi.fn() })),
    in: vi.fn(() => ({ socketsLeave: vi.fn() })),
  }) as unknown as Server

const createClient = (id: string, clientId: string) => {
  const emitted: Emitted[] = []
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

const quizz: Quizz = {
  subject: "Names",
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

const newGame = () =>
  new Game({
    io: createIo(),
    socket: createClient("manager", "manager-client").socket,
    quizz,
    visuals: {},
  })

describe("Game joining with a short name", () => {
  it.each(["A", "Bo", "Amy"])("lets %j join", (name) => {
    const game = newGame()
    const player = createClient("p1", "p1-client")

    game.join(player.socket, name)

    expect(game.players.map(({ username }) => username)).toEqual([name])
    expect(player.emitted.map(({ event }) => event)).toContain(
      EVENTS.GAME.SUCCESS_JOIN,
    )
  })

  it("keeps a one-letter name unique ignoring case", () => {
    const game = newGame()
    game.join(createClient("p1", "p1-client").socket, "A")

    const second = createClient("p2", "p2-client")
    game.join(second.socket, "a")

    expect(game.players).toHaveLength(1)
    expect(second.emitted).toEqual([
      {
        event: EVENTS.GAME.ERROR_MESSAGE,
        payload: "errors:auth.usernameTaken",
      },
    ])
  })

  it.each([
    ["spaces only", "   ", "errors:auth.usernameTooShort"],
    [
      "non-breaking spaces only",
      "\u00a0\u00a0",
      "errors:auth.usernameTooShort",
    ],
    ["21 characters", "a".repeat(21), "errors:auth.usernameTooLong"],
    ["a zero-width character", "\u200b\u200b", "errors:auth.usernameInvalid"],
  ])("still turns away %s", (_label, name, message) => {
    const game = newGame()
    const player = createClient("p1", "p1-client")

    game.join(player.socket, name)

    expect(game.players).toHaveLength(0)
    expect(player.emitted).toEqual([
      { event: EVENTS.GAME.ERROR_MESSAGE, payload: message },
    ])
  })
})
