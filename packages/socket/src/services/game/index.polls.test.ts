import { EVENTS } from "@razzia/common/constants"
import type { GameResult, Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { PollResultRecord, PollWithId } from "@razzia/common/types/poll"
import Game from "@razzia/socket/services/game"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  saveResult: vi.fn<(_result: GameResult) => void>(),
  getPollById: vi.fn<(_id: string) => PollWithId>(),
}))

// Closing a game would otherwise write into config/results and read polls
// from the real config folder.
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

const lunch = (anonymous = true): PollWithId => ({
  id: "lunch",
  question: "Lunch?",
  options: ["Pizza", "Soup"],
  anonymous,
  // These tests are about the host's live counts; the sealed default has its
  // own tests in index.polls.sealed.test.ts.
  live: true,
})

const createGame = (lecture = true) => {
  const { io, emitted } = createIo()
  const manager = createClient("manager", "manager-client")
  const records: PollResultRecord[] = []
  const onPollSettled = vi.fn((record: PollResultRecord) => {
    records.push(record)

    return true
  })
  const game = new Game({
    io,
    socket: manager.socket,
    quizz,
    visuals: {},
    lecture,
    onPollSettled,
  })
  const alice = createClient("alice-sock", "alice-client")
  const bob = createClient("bob-sock", "bob-client")

  game.join(alice.socket, "Alice")
  game.join(bob.socket, "Bobby")
  emitted.length = 0

  return { game, emitted, manager, alice, bob, records, onPollSettled }
}

type Setup = ReturnType<typeof createGame>

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

const reconnectOf = (setup: Setup, who: "manager" | "alice") => {
  const client =
    who === "manager"
      ? createClient("manager-back", "manager-client")
      : createClient("alice-back", "alice-client")

  if (who === "manager") {
    setup.game.reconnectManager(client.socket)

    return findEvent(
      client.emitted,
      EVENTS.MANAGER.SUCCESS_RECONNECT,
    ) as Record<string, unknown>
  }

  setup.game.reconnectPlayer(client.socket)

  return findEvent(client.emitted, EVENTS.PLAYER.SUCCESS_RECONNECT) as Record<
    string,
    unknown
  >
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.saveResult.mockClear()
  mocks.getPollById.mockReset()
  mocks.getPollById.mockImplementation(() => lunch())
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("Game polls starting", () => {
  it("runs only in a lecture room, for its host", () => {
    const normal = createGame(false)
    const lecture = createGame()

    expect(normal.game.startPoll(normal.manager.socket, "lunch")).toBe(
      "notLecture",
    )
    expect(lecture.game.startPoll(lecture.alice.socket, "lunch")).toBe(
      "notManager",
    )
    expect(lecture.game.startPoll(lecture.manager.socket, "lunch")).toBe(
      "accepted",
    )
  })

  it("answers notFound, never silence, when the poll cannot be read", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.getPollById.mockImplementation(() => {
      throw new Error("missing")
    })
    const setup = createGame()

    expect(setup.game.startPoll(setup.manager.socket, "../game")).toBe(
      "notFound",
    )

    mocks.getPollById.mockImplementation(() => lunch())

    expect(setup.game.startPoll(setup.manager.socket, "lunch")).toBe("accepted")
  })

  it("never lets a poll id forge a line in the server log", () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    mocks.getPollById.mockImplementation(() => {
      throw new Error("missing")
    })
    const setup = createGame()

    setup.game.startPoll(
      setup.manager.socket,
      "lunch\nFORGED: manager logged in",
    )

    const lines = logged.mock.calls.map(([line]) => String(line))

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain("lunch")
    expect(lines[0]).not.toContain("\n")
  })

  it("takes the lobby and the time between questions, not a running question", async () => {
    const setup = createGame()

    expect(setup.game.startPoll(setup.manager.socket, "lunch")).toBe("accepted")
    expect(setup.game.startPoll(setup.manager.socket, "lunch")).toBe("busy")
    setup.game.closePoll(setup.manager.socket)
    setup.game.dismissPoll(setup.manager.socket)

    setup.game.playQuestion(setup.manager.socket, 0)
    await vi.advanceTimersByTimeAsync(4_000)

    expect(setup.game.startPoll(setup.manager.socket, "lunch")).toBe("busy")

    await vi.advanceTimersByTimeAsync(60_000)

    expect(setup.game.startPoll(setup.manager.socket, "lunch")).toBe("accepted")
  })

  it("sends no poll to a room that never ran one", () => {
    const setup = createGame()

    expect(reconnectOf(setup, "alice")).not.toHaveProperty("poll")
    expect(reconnectOf(setup, "manager")).not.toHaveProperty("poll")
  })
})

describe("Game polls owning the room", () => {
  it("holds every quiz step until the host has dismissed the result", async () => {
    const setup = createGame()
    await playToResults(setup, 0)
    setup.emitted.length = 0

    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.nextRound(setup.manager.socket)
    setup.game.showLeaderboard(setup.manager.socket)

    expect(setup.game.playQuestion(setup.manager.socket, 1)).toBe("busy")
    expect(setup.game.finish(setup.manager.socket)).toBe("busy")

    setup.game.closePoll(setup.manager.socket)

    expect(setup.game.playQuestion(setup.manager.socket, 1)).toBe("busy")

    setup.game.dismissPoll(setup.manager.socket)
    await vi.advanceTimersByTimeAsync(0)

    expect(
      setup.emitted.filter(
        ({ event }) =>
          event === EVENTS.GAME.STATUS || event === EVENTS.GAME.UPDATE_QUESTION,
      ),
    ).toEqual([])
    expect(setup.game.playQuestion(setup.manager.socket, 1)).toBe("accepted")
  })

  it("does not start the first question from the lobby while a poll is showing", async () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.emitted.length = 0

    await setup.game.start(setup.manager.socket)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(setup.game.started).toBe(false)
    expect(
      setup.emitted.filter(({ event }) => event === EVENTS.GAME.STATUS),
    ).toEqual([])
  })

  it("leaves the quiz exactly as it was", async () => {
    const setup = createGame()
    await playToResults(setup, 0)
    const before = reconnectOf(setup, "manager")
    const pointsBefore = setup.game.players.map(({ points }) => points)
    setup.emitted.length = 0
    setup.alice.emitted.length = 0

    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 1)
    setup.game.closePoll(setup.manager.socket)
    setup.game.dismissPoll(setup.manager.socket)
    await vi.advanceTimersByTimeAsync(60_000)

    const quizEvents = new Set<string>([
      EVENTS.GAME.STATUS,
      EVENTS.GAME.UPDATE_QUESTION,
      EVENTS.MANAGER.LECTURE_STATE,
      EVENTS.PLAYER.UPDATE_LEADERBOARD,
      EVENTS.GAME.START_COOLDOWN,
      EVENTS.GAME.COOLDOWN,
    ])

    expect(setup.emitted.filter(({ event }) => quizEvents.has(event))).toEqual(
      [],
    )
    expect(setup.game.players.map(({ points }) => points)).toEqual(pointsBefore)

    const after = reconnectOf(setup, "manager")

    // A reconnect re-stamps the clock of the screen it replays; nothing else
    // about the screen may differ.
    const withoutClock = (value: unknown) => {
      const status = value as { name: string; data: object }

      return { ...status, data: { ...status.data, serverNow: 0 } }
    }

    expect(after.currentQuestion).toEqual(before.currentQuestion)
    expect(after.lecture).toEqual(before.lecture)
    expect(withoutClock(after.status)).toEqual(withoutClock(before.status))
    expect(after).not.toHaveProperty("poll")
  })
})

describe("Game polls voting", () => {
  it("takes a vote, lets it change, and keeps one vote per student", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.emitted.length = 0

    expect(setup.game.votePoll(setup.alice.socket, "lunch", 0)).toBe("accepted")
    expect(setup.game.votePoll(setup.bob.socket, "lunch", 0)).toBe("accepted")
    expect(setup.game.votePoll(setup.alice.socket, "lunch", 1)).toBe("accepted")
    expect(setup.game.votePoll(setup.alice.socket, "lunch", 1)).toBe(
      "unchanged",
    )

    expect(sentTo(setup.emitted, "manager", EVENTS.POLL.TALLY).at(-1)).toEqual({
      pollId: "lunch",
      counts: [1, 1],
      total: 2,
    })
  })

  it("ignores a vote when nothing is open, and from the host", () => {
    const setup = createGame()

    expect(setup.game.votePoll(setup.alice.socket, "lunch", 0)).toBe("closed")

    setup.game.startPoll(setup.manager.socket, "lunch")

    expect(setup.game.votePoll(setup.manager.socket, "lunch", 0)).toBe(
      "notPlayer",
    )
  })
})

describe("Game polls on a screen that joins late or comes back", () => {
  it("restores a reconnecting student's poll with their own choice", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 1)
    setup.game.setPlayerDisconnected("alice-sock")

    expect(reconnectOf(setup, "alice").poll).toEqual({
      pollId: "lunch",
      question: "Lunch?",
      options: ["Pizza", "Soup"],
      anonymous: true,
      phase: "open",
      mine: 1,
    })
  })

  it("restores the host's poll with the counts after a reload", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 0)
    setup.game.setManagerDisconnected()

    expect(reconnectOf(setup, "manager").poll).toMatchObject({
      phase: "open",
      counts: [1, 0],
      total: 1,
    })
  })

  it("shows the result again to a student who comes back after it closed", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 1)
    setup.game.closePoll(setup.manager.socket)

    expect(reconnectOf(setup, "alice").poll).toMatchObject({
      phase: "closed",
      mine: 1,
      counts: [0, 1],
      total: 1,
    })
  })

  it("gives a student who joins mid-poll the poll on their first reconnect", async () => {
    const setup = createGame()
    await playToResults(setup, 0)
    setup.game.startPoll(setup.manager.socket, "lunch")

    // The join page hands over to the game page, which asks to reconnect.
    setup.game.join(createClient("carol-sock", "carol-client").socket, "Carol")
    const arrived = createClient("carol-page", "carol-client")
    setup.game.reconnectPlayer(arrived.socket)

    expect(
      (
        findEvent(arrived.emitted, EVENTS.PLAYER.SUCCESS_RECONNECT) as {
          poll?: { phase: string; mine: number | null }
        }
      ).poll,
    ).toMatchObject({ phase: "open", mine: null })
  })
})

describe("Game polls when a student leaves", () => {
  it("takes their vote with them while the poll is open", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 0)
    setup.game.votePoll(setup.bob.socket, "lunch", 0)
    setup.emitted.length = 0

    setup.game.kickPlayer(setup.manager.socket, "alice-sock")

    expect(sentTo(setup.emitted, "manager", EVENTS.POLL.TALLY).at(-1)).toEqual({
      pollId: "lunch",
      counts: [1, 0],
      total: 1,
    })
  })

  it("takes their vote with them when they leave the lobby on their own", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 1)
    setup.emitted.length = 0

    setup.game.removePlayer("alice-sock")

    expect(sentTo(setup.emitted, "manager", EVENTS.POLL.TALLY).at(-1)).toEqual({
      pollId: "lunch",
      counts: [0, 0],
      total: 0,
    })
  })

  it("keeps a named result as the host saw it when a voter is kicked afterwards", () => {
    mocks.getPollById.mockImplementation(() => lunch(false))
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 0)
    setup.game.closePoll(setup.manager.socket)

    setup.game.kickPlayer(setup.manager.socket, "alice-sock")

    expect(reconnectOf(setup, "manager").poll).toMatchObject({
      counts: [1, 0],
      voters: [{ username: "Alice", option: 0 }],
    })
  })

  it("does not change a result that has closed", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 0)
    setup.game.closePoll(setup.manager.socket)

    setup.game.kickPlayer(setup.manager.socket, "alice-sock")

    expect(reconnectOf(setup, "manager").poll).toMatchObject({
      counts: [1, 0],
      total: 1,
    })
  })
})

describe("Game polls privacy", () => {
  const pollEvents = (setup: Setup) =>
    setup.emitted.filter(({ event }) => event.startsWith("poll:"))

  it("never tells anyone, or keeps, who voted for what in an anonymous poll", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 0)
    setup.game.votePoll(setup.bob.socket, "lunch", 1)
    setup.game.closePoll(setup.manager.socket)

    const everything = JSON.stringify([
      pollEvents(setup),
      reconnectOf(setup, "manager").poll,
      reconnectOf(setup, "alice").poll,
      setup.records,
    ])

    expect(setup.records).toHaveLength(1)
    expect(everything).not.toMatch(/Alice|Bobby|alice-client|bob-client/u)
  })

  it("shows names to the host only, in a named poll", () => {
    mocks.getPollById.mockImplementation(() => lunch(false))
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 0)
    setup.game.closePoll(setup.manager.socket)

    const toPlayers = pollEvents(setup).filter(
      ({ target }) => target !== "manager",
    )

    expect(JSON.stringify(toPlayers)).not.toContain("Alice")
    expect(
      sentTo(setup.emitted, "manager", EVENTS.POLL.TALLY).at(-1),
    ).toMatchObject({ voters: [{ username: "Alice", option: 0 }] })
    expect(setup.records[0].voters).toEqual([{ username: "Alice", option: 0 }])
  })
})

describe("Game polls when the room closes", () => {
  it("keeps a poll still open as a partial result, once", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 0)

    setup.game.close("errors:game.managerDisconnected")
    setup.game.settlePoll()

    expect(setup.onPollSettled).toHaveBeenCalledTimes(1)
    expect(setup.records[0]).toMatchObject({
      pollId: "lunch",
      gameSubject: "Lecture",
      partial: true,
      counts: [1, 0],
    })
  })

  it("does not write a poll again that was kept when it closed", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.closePoll(setup.manager.socket)

    setup.game.close("errors:game.managerDisconnected")

    expect(setup.onPollSettled).toHaveBeenCalledTimes(1)
    expect(setup.records[0]).not.toHaveProperty("partial")
  })

  it("writes nothing when no poll ran", () => {
    const setup = createGame()

    setup.game.close("errors:game.managerDisconnected")

    expect(setup.onPollSettled).not.toHaveBeenCalled()
  })
})

describe("Game polls when a screen asks where things stand", () => {
  it("tells a student who has just joined about the poll that is already up", async () => {
    const setup = createGame()
    await playToResults(setup, 0)
    setup.game.startPoll(setup.manager.socket, "lunch")

    // Their page opens without asking to reconnect, so it asks for the poll.
    const carol = createClient("carol-sock", "carol-client")
    setup.game.join(carol.socket, "Carol")
    carol.emitted.length = 0
    setup.game.syncPoll(carol.socket)

    expect(findEvent(carol.emitted, EVENTS.POLL.STATE)).toEqual({
      pollId: "lunch",
      question: "Lunch?",
      options: ["Pizza", "Soup"],
      anonymous: true,
      phase: "open",
      mine: null,
    })
  })

  it("tells a student their own choice, and the host the counts", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.votePoll(setup.alice.socket, "lunch", 1)
    setup.alice.emitted.length = 0
    setup.manager.emitted.length = 0

    setup.game.syncPoll(setup.alice.socket)
    setup.game.syncPoll(setup.manager.socket)

    expect(findEvent(setup.alice.emitted, EVENTS.POLL.STATE)).toMatchObject({
      mine: 1,
    })
    expect(findEvent(setup.manager.emitted, EVENTS.POLL.STATE)).toMatchObject({
      counts: [0, 1],
      total: 1,
    })
  })

  it("says nothing is showing with null, so a stale overlay clears", () => {
    const setup = createGame()

    setup.game.syncPoll(setup.alice.socket)
    setup.game.startPoll(setup.manager.socket, "lunch")
    setup.game.closePoll(setup.manager.socket)
    setup.game.dismissPoll(setup.manager.socket)
    setup.alice.emitted.length = 0
    setup.game.syncPoll(setup.alice.socket)

    expect(findEvent(setup.alice.emitted, EVENTS.POLL.STATE)).toBeNull()
  })

  it("ignores a socket that is nobody in the room", () => {
    const setup = createGame()
    setup.game.startPoll(setup.manager.socket, "lunch")
    const stranger = createClient("stranger", "stranger-client")

    setup.game.syncPoll(stranger.socket)

    expect(stranger.emitted).toEqual([])
  })
})
