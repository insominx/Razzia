import { EVENTS } from "@razzia/common/constants"
import type { GameResult, Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { PollResultRecord, PollWithId } from "@razzia/common/types/poll"
import Game from "@razzia/socket/services/game"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A poll typed on a slide and sent with the command that starts it: checked
// like a stored poll, never written to the stored polls, and kept in the
// result under the deck's own id.

const mocks = vi.hoisted(() => ({
  saveResult: vi.fn<(_result: GameResult) => void>(),
  getPollById: vi.fn<(_id: string) => PollWithId>(),
}))

vi.mock("@razzia/socket/services/config", () => ({
  saveResult: mocks.saveResult,
}))

vi.mock("@razzia/socket/services/poll-store", () => ({
  getPollById: mocks.getPollById,
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

const quizz: Quizz = {
  subject: "Lecture",
  questions: [0, 1].map(() => ({
    question: "Pick one",
    answers: ["No", "Yes"],
    solutions: [1],
    cooldown: 1,
    time: 5,
  })),
}

const definition = {
  id: "path-pick",
  question: "Which path fits you?",
  options: ["Full game", "Minigame"],
}

const createGame = (lecture = true) => {
  const { io, emitted } = createIo()
  const manager = createClient("manager", "manager-client")
  const records: PollResultRecord[] = []
  const game = new Game({
    io,
    socket: manager.socket,
    quizz,
    visuals: {},
    lecture,
    onPollSettled: (record) => {
      records.push(record)

      return true
    },
  })
  const alice = createClient("alice-sock", "alice-client")
  const bob = createClient("bob-sock", "bob-client")

  game.join(alice.socket, "Alice")
  game.join(bob.socket, "Bobby")
  emitted.length = 0

  return { game, emitted, manager, alice, bob, records }
}

const toManager = (emitted: Emitted[], event: string) =>
  emitted
    .filter((entry) => entry.target === "manager" && entry.event === event)
    .map(({ payload }) => payload)

beforeEach(() => {
  vi.useFakeTimers()
  mocks.getPollById.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("authoritative manager presence", () => {
  it("reports disconnect to the host without losing membership or a sealed vote", () => {
    const { game, emitted, manager, alice, records } = createGame()
    game.startInlinePoll(manager.socket, definition)
    game.votePoll(alice.socket, definition.id, 1)
    emitted.length = 0
    game.setPlayerDisconnected(alice.socket.id)
    expect(
      toManager(emitted, EVENTS.MANAGER.PLAYER_PRESENCE).at(-1),
    ).toMatchObject({
      gameId: game.gameId,
      players: [
        { username: "Alice", connected: false },
        { username: "Bobby", connected: true },
      ],
    })
    expect(
      JSON.stringify(toManager(emitted, EVENTS.MANAGER.PLAYER_PRESENCE)),
    ).not.toContain("clientId")
    expect(
      emitted
        .filter((e) => e.event === EVENTS.MANAGER.PLAYER_PRESENCE)
        .every((e) => e.target === manager.socket.id),
    ).toBe(true)
    expect(game.players).toHaveLength(2)
    expect(toManager(emitted, EVENTS.POLL.TALLY)).toEqual([])
    game.closePoll(manager.socket)
    expect(records[0]).toMatchObject({ total: 1, counts: [0, 1] })
    expect(records[0]).not.toHaveProperty("voters")
  })

  it("publishes joins, reconnections and removals; ignores an obsolete disconnect", () => {
    const { game, emitted, manager } = createGame()
    const late = createClient("late", "late-client")
    game.join(late.socket, "Late")
    expect(
      toManager(emitted, EVENTS.MANAGER.PLAYER_PRESENCE).at(-1),
    ).toMatchObject({
      players: [{}, {}, { username: "Late", connected: true }],
    })
    const back = createClient("alice-back", "alice-client")
    game.reconnectPlayer(back.socket)
    expect(
      toManager(emitted, EVENTS.MANAGER.PLAYER_PRESENCE).at(-1),
    ).toMatchObject({
      players: [{ id: "alice-back", connected: true }, {}, {}],
    })
    emitted.length = 0
    game.setPlayerDisconnected("alice-sock")
    expect(toManager(emitted, EVENTS.MANAGER.PLAYER_PRESENCE)).toEqual([])
    expect(game.players[0].connected).toBe(true)
    game.removePlayer(late.socket.id)
    expect(
      (
        toManager(emitted, EVENTS.MANAGER.PLAYER_PRESENCE).at(-1) as {
          players: unknown[]
        }
      ).players,
    ).toHaveLength(2)
    game.kickPlayer(manager.socket, back.socket.id)
    expect(
      (
        toManager(emitted, EVENTS.MANAGER.PLAYER_PRESENCE).at(-1) as {
          players: unknown[]
        }
      ).players,
    ).toHaveLength(1)
  })

  it("restores current presence on host reconnect without leaking private ids", () => {
    const { game } = createGame()
    game.setManagerDisconnected()
    game.setPlayerDisconnected("alice-sock")
    const back = createClient("host-back", "manager-client")
    game.reconnectManager(back.socket)
    const snapshot = findReconnect(back)
    expect(snapshot.players.map((p) => p.connected)).toEqual([false, true])
    expect(snapshot.players.some((p) => "clientId" in p)).toBe(false)
  })
})

const findReconnect = (client: ReturnType<typeof createClient>) =>
  client.emitted.find((e) => e.event === EVENTS.MANAGER.SUCCESS_RECONNECT)
    ?.payload as { players: Array<{ connected: boolean }> }
