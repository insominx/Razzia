import { EVENTS } from "@razzia/common/constants"
import type { GameResult, Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { PollResultRecord, PollWithId } from "@razzia/common/types/poll"
import Game from "@razzia/socket/services/game"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The sealed default, end to end through the room: whatever way the host's
// page learns of an open poll (start, sync, reconnect, a kick, a join), it is
// never told a count or a name before the close.

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

// What a stored poll without a `live` field looks like: every poll saved
// before the switch existed.
const lunch = (anonymous = true): PollWithId => ({
  id: "lunch",
  question: "Lunch?",
  options: ["Pizza", "Soup"],
  anonymous,
})

const createGame = () => {
  const { io, emitted } = createIo()
  const manager = createClient("manager", "manager-client")
  const records: PollResultRecord[] = []
  const game = new Game({
    io,
    socket: manager.socket,
    quizz,
    visuals: {},
    lecture: true,
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

const findEvent = (
  emitted: Array<Omit<Emitted, "target">>,
  event: string,
): unknown => emitted.find((entry) => entry.event === event)?.payload

beforeEach(() => {
  vi.useFakeTimers()
  mocks.getPollById.mockReset()
  mocks.getPollById.mockImplementation(() => lunch())
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("Game polls, sealed by default", () => {
  it("treats a stored poll with no live field as sealed", () => {
    const setup = createGame()

    expect(setup.game.startPoll(setup.manager.socket, "lunch")).toBe("accepted")
    setup.game.votePoll(setup.alice.socket, "lunch", 1)

    expect(toManager(setup.emitted, EVENTS.POLL.STATE)[0]).toEqual({
      pollId: "lunch",
      question: "Lunch?",
      options: ["Pizza", "Soup"],
      anonymous: true,
      phase: "open",
      total: 0,
    })
    expect(toManager(setup.emitted, EVENTS.POLL.TALLY)).toEqual([
      { pollId: "lunch", total: 1, arrived: "Alice" },
    ])
  })

  it("runs a stored poll that says live: true with counts as they arrive", () => {
    mocks.getPollById.mockImplementation(() => ({ ...lunch(), live: true }))
    const setup = createGame()

    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 1)

    expect(toManager(setup.emitted, EVENTS.POLL.TALLY)).toEqual([
      { pollId: "lunch", counts: [0, 1], total: 1 },
    ])
  })

  it("keeps the sealed view for a host page that asks where things stand", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 0)
    setup.manager.emitted.length = 0

    setup.game.syncPoll(setup.manager.socket)

    expect(findEvent(setup.manager.emitted, EVENTS.POLL.STATE)).toEqual({
      pollId: "lunch",
      question: "Lunch?",
      options: ["Pizza", "Soup"],
      anonymous: true,
      phase: "open",
      total: 1,
    })
  })

  it("keeps the sealed view for a host who reloads mid-poll", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 0)
    setup.game.votePoll(setup.bob.socket, "lunch", 1)

    const back = createClient("manager-back", "manager-client")
    setup.game.reconnectManager(back.socket)
    const reconnect = findEvent(
      back.emitted,
      EVENTS.MANAGER.SUCCESS_RECONNECT,
    ) as { poll?: Record<string, unknown> }

    expect(reconnect.poll).toEqual({
      pollId: "lunch",
      question: "Lunch?",
      options: ["Pizza", "Soup"],
      anonymous: true,
      phase: "open",
      total: 2,
    })
  })

  it("tells the host no counts when a voter is kicked or leaves", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 0)
    setup.game.votePoll(setup.bob.socket, "lunch", 0)
    setup.emitted.length = 0

    setup.game.kickPlayer(setup.manager.socket, "alice-sock")
    setup.game.removePlayer("bob-sock")

    expect(toManager(setup.emitted, EVENTS.POLL.TALLY)).toEqual([
      { pollId: "lunch", total: 1 },
      { pollId: "lunch", total: 0 },
    ])
  })

  it("never lets a named sealed poll put who voted for what on the host's wire before the close", () => {
    mocks.getPollById.mockImplementation(() => lunch(false))
    const setup = createGame()

    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 0)
    setup.game.votePoll(setup.bob.socket, "lunch", 1)
    setup.game.syncPoll(setup.manager.socket)

    const wire = JSON.stringify(
      setup.emitted.filter(({ target }) => target === "manager"),
    )
    const sync = JSON.stringify(setup.manager.emitted)

    // Each name rides only its own first vote's tally, beside the total.
    expect(toManager(setup.emitted, EVENTS.POLL.TALLY)).toEqual([
      { pollId: "lunch", total: 1, arrived: "Alice" },
      { pollId: "lunch", total: 2, arrived: "Bobby" },
    ])
    expect(wire).not.toContain('"voters"')
    expect(wire).not.toContain('"counts"')
    expect(sync).not.toContain("Alice")
    expect(sync).not.toContain("Bobby")

    setup.emitted.length = 0
    setup.game.closePoll(setup.manager.socket)

    expect(toManager(setup.emitted, EVENTS.POLL.STATE)[0]).toMatchObject({
      phase: "closed",
      counts: [1, 1],
      total: 2,
      voters: [
        { username: "Alice", option: 0 },
        { username: "Bobby", option: 1 },
      ],
    })
    expect(setup.records[0]).toMatchObject({ counts: [1, 1], total: 2 })
  })

  it("lets a student join during an open sealed poll and counts them in the room total", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.emitted.length = 0

    setup.game.join(createClient("carol-sock", "carol-client").socket, "Carol")

    // The host's "n of m voted" takes m from this event, which every join
    // sends to the whole room.
    expect(
      setup.emitted
        .filter(({ event }) => event === EVENTS.GAME.TOTAL_PLAYERS)
        .map(({ payload }) => payload),
    ).toEqual([3])
  })

  it("saves the full result when the room closes on an open sealed poll", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 1)
    setup.game.votePoll(setup.bob.socket, "lunch", 1)

    setup.game.settlePoll()

    expect(setup.records).toHaveLength(1)
    expect(setup.records[0]).toMatchObject({
      counts: [0, 2],
      total: 2,
      partial: true,
    })
  })
})
