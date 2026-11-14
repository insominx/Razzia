import { EVENTS } from "@razzia/common/constants"
import type { Player } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type {
  PollResultRecord,
  PollTally,
  PollWithId,
} from "@razzia/common/types/poll"
import {
  MAX_VOTE_CHANGES,
  PollManager,
} from "@razzia/socket/services/game/poll-manager"
import { describe, expect, it, vi } from "vitest"

interface Emitted {
  target: string
  event: string
  payload: unknown
}

const poll = (anonymous = true): PollWithId => ({
  id: "lunch",
  question: "Lunch?",
  options: ["Pizza", "Soup", "Salad"],
  anonymous,
  // These tests are about the host's live counts; the sealed default has its
  // own tests in poll-manager.sealed.test.ts.
  live: true,
})

const player = (id: string, name: string, connected = true): Player => ({
  id,
  clientId: `${name.toLowerCase()}-client`,
  connected,
  username: name,
  points: 0,
  streak: 0,
})

const socketOf = (id: string) => ({ id }) as unknown as Socket

const host = socketOf("manager")

const setup = (anonymous = true, saved = true, started = true) => {
  const emitted: Emitted[] = []
  const records: PollResultRecord[] = []
  const roster = [
    player("alice-sock", "Alice"),
    player("bob-sock", "Bob"),
    player("carol-sock", "Carol", false),
  ]
  const io = {
    to: (target: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ target, event, payload })
      },
    }),
  } as unknown as Server
  const onSettled = vi.fn((record: PollResultRecord) => {
    records.push(record)

    return saved
  })
  const manager = new PollManager({
    io,
    players: {
      getAll: () => roster,
      findById: (id) => roster.find((p) => p.id === id),
      findByClientId: (clientId) => roster.find((p) => p.clientId === clientId),
    },
    gameSubject: "Lecture 4",
    getManagerId: () => "manager",
    isManager: (socket) => socket.id === "manager",
    onSettled,
  })

  if (started) {
    manager.start(host, poll(anonymous))
    emitted.length = 0
  }

  return { manager, emitted, records, onSettled, roster }
}

const alice = socketOf("alice-sock")
const bob = socketOf("bob-sock")

const eventsTo = (emitted: Emitted[], target: string, event: string) =>
  emitted
    .filter((entry) => entry.target === target && entry.event === event)
    .map(({ payload }) => payload)

describe("PollManager starting", () => {
  it("starts only for the host, and only one poll at a time", () => {
    const { manager } = setup()

    expect(manager.start(alice, poll())).toBe("notManager")
    expect(manager.start(host, poll())).toBe("busy")
    expect(manager.isActive()).toBe(true)
  })

  it("tells each connected player their own view and the host the counts, to nobody else", () => {
    const { manager, emitted } = setup(true, true, false)

    expect(manager.start(host, poll())).toBe("accepted")

    // Carol's phone is not connected; nothing is broadcast to the room.
    expect(emitted.map(({ target }) => target).sort()).toEqual([
      "alice-sock",
      "bob-sock",
      "manager",
    ])
    expect(eventsTo(emitted, "alice-sock", EVENTS.POLL.STATE)[0]).toEqual({
      pollId: "lunch",
      question: "Lunch?",
      options: ["Pizza", "Soup", "Salad"],
      anonymous: true,
      phase: "open",
      // A phone is told the poll is live only so it knows its name will not
      // show as it votes; it still gets no counts.
      live: true,
      mine: null,
    })
    expect(eventsTo(emitted, "manager", EVENTS.POLL.STATE)[0]).toEqual({
      pollId: "lunch",
      question: "Lunch?",
      options: ["Pizza", "Soup", "Salad"],
      anonymous: true,
      phase: "open",
      counts: [0, 0, 0],
      total: 0,
      live: true,
    })
  })
})

describe("PollManager voting", () => {
  it("counts a vote and tells the host the running count", () => {
    const { manager, emitted } = setup()

    expect(manager.vote(alice, "lunch", 1)).toBe("accepted")
    expect(manager.vote(bob, "lunch", 1)).toBe("accepted")

    expect(eventsTo(emitted, "manager", EVENTS.POLL.TALLY).at(-1)).toEqual({
      pollId: "lunch",
      counts: [0, 2, 0],
      total: 2,
    })
  })

  it("lets a voter change their vote, which moves the count", () => {
    const { manager, emitted } = setup()

    manager.vote(alice, "lunch", 0)

    expect(manager.vote(alice, "lunch", 2)).toBe("accepted")
    expect(
      eventsTo(emitted, "manager", EVENTS.POLL.TALLY).at(-1),
    ).toMatchObject({ counts: [0, 0, 1], total: 1 })
    expect(manager.snapshotForPlayer("alice-client")?.mine).toBe(2)
  })

  it("ignores the same vote again without telling the host", () => {
    const { manager, emitted } = setup()

    manager.vote(alice, "lunch", 0)
    const before = emitted.length

    expect(manager.vote(alice, "lunch", 0)).toBe("unchanged")
    expect(emitted).toHaveLength(before)
  })

  it("turns away an option that does not exist, the wrong poll and a non-player", () => {
    const { manager } = setup()

    for (const option of [-1, 3, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(manager.vote(alice, "lunch", option)).toBe("invalid")
    }

    expect(manager.vote(alice, "other", 0)).toBe("invalid")
    expect(manager.vote(host, "lunch", 0)).toBe("notPlayer")
    expect(manager.snapshotForHost()?.total).toBe(0)
  })

  it("stops a client that keeps changing its vote, per client", () => {
    const { manager } = setup()

    manager.vote(alice, "lunch", 0)

    for (let change = 1; change <= MAX_VOTE_CHANGES; change += 1) {
      expect(manager.vote(alice, "lunch", change % 2)).toBe("accepted")
    }

    expect(manager.vote(alice, "lunch", 2)).toBe("tooManyChanges")
    expect(manager.vote(bob, "lunch", 2)).toBe("accepted")
  })

  it("shows the host who voted only in a named poll", () => {
    const named = setup(false)
    const anonymous = setup(true)

    for (const { manager } of [named, anonymous]) {
      manager.vote(alice, "lunch", 1)
      manager.vote(bob, "lunch", 0)
    }

    expect(named.manager.snapshotForHost()?.voters).toEqual([
      { username: "Bob", option: 0 },
      { username: "Alice", option: 1 },
    ])
    expect(
      eventsTo(named.emitted, "manager", EVENTS.POLL.TALLY).at(-1),
    ).toHaveProperty("voters")
    expect(anonymous.manager.snapshotForHost()).not.toHaveProperty("voters")
    expect(
      eventsTo(anonymous.emitted, "manager", EVENTS.POLL.TALLY).at(-1),
    ).not.toHaveProperty("voters")
  })

  it("drops a leaving voter's vote while open", () => {
    const { manager, emitted } = setup()

    manager.vote(alice, "lunch", 1)
    manager.forgetPlayer("alice-client")

    expect(
      eventsTo(emitted, "manager", EVENTS.POLL.TALLY).at(-1),
    ).toMatchObject({ counts: [0, 0, 0], total: 0 })
    // And they may vote afresh without having used up a change.
    expect(manager.vote(alice, "lunch", 2)).toBe("accepted")
  })
})

describe("PollManager closing", () => {
  it("is the host's to close, once", () => {
    const { manager } = setup()

    expect(manager.close(alice)).toBe("notManager")
    expect(manager.close(host)).toBe("accepted")
    expect(manager.close(host)).toBe("none")
  })

  it("shows the players the counts and their own pick, and takes no more votes", () => {
    const { manager, emitted } = setup()

    manager.vote(alice, "lunch", 2)
    manager.vote(bob, "lunch", 2)
    emitted.length = 0
    manager.close(host)

    const [toAlice] = eventsTo(emitted, "alice-sock", EVENTS.POLL.STATE)

    expect(toAlice).toMatchObject({
      phase: "closed",
      mine: 2,
      counts: [0, 0, 2],
      total: 2,
    })
    expect(manager.vote(alice, "lunch", 0)).toBe("closed")
  })

  it("keeps the result as the host saw it when a voter leaves afterwards", () => {
    const { manager } = setup()

    manager.vote(alice, "lunch", 0)
    manager.close(host)
    manager.forgetPlayer("alice-client")

    expect(manager.snapshotForHost()).toMatchObject({
      counts: [1, 0, 0],
      total: 1,
    })
  })

  it("leaves a final record that names voters only for a named poll", () => {
    const named = setup(false)
    const anonymous = setup(true)

    for (const { manager } of [named, anonymous]) {
      manager.vote(alice, "lunch", 0)
      manager.close(host)
    }

    expect(named.records).toHaveLength(1)
    expect(named.records[0]).toMatchObject({
      pollId: "lunch",
      gameSubject: "Lecture 4",
      counts: [1, 0, 0],
      total: 1,
      voters: [{ username: "Alice", option: 0 }],
    })
    expect(named.records[0]).not.toHaveProperty("partial")
    expect(anonymous.records[0]).not.toHaveProperty("voters")
    expect(JSON.stringify(anonymous.records)).not.toContain("Alice")
  })

  it("is dismissed by the host only once it has closed, then the room is free again", () => {
    const { manager, emitted } = setup()

    expect(manager.dismiss(host)).toBe("none")
    manager.close(host)
    expect(manager.dismiss(alice)).toBe("notManager")
    emitted.length = 0
    expect(manager.dismiss(host)).toBe("accepted")

    expect(eventsTo(emitted, "alice-sock", EVENTS.POLL.STATE)).toEqual([null])
    expect(eventsTo(emitted, "manager", EVENTS.POLL.STATE)).toEqual([null])
    expect(manager.isActive()).toBe(false)
    expect(manager.vote(alice, "lunch", 0)).toBe("closed")
    expect(manager.start(host, poll())).toBe("accepted")
    expect(manager.snapshotForHost()?.total).toBe(0)
  })
})

describe("PollManager settling when the room closes", () => {
  it("keeps a poll still open as a partial result, once", () => {
    const { manager, records } = setup()

    manager.vote(alice, "lunch", 1)
    manager.settlePending()
    manager.settlePending()

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ partial: true, counts: [0, 1, 0] })
  })

  it("writes nothing for a poll that was dismissed and saved", () => {
    const { manager, records } = setup()

    manager.close(host)
    manager.dismiss(host)
    manager.settlePending()

    expect(records).toHaveLength(1)
  })

  it("offers a result again when its first save failed, until it is kept", () => {
    const attempts: boolean[] = []
    const { manager, onSettled } = setup(true, false)

    manager.close(host)
    onSettled.mockImplementation(() => {
      attempts.push(true)

      return attempts.length >= 2
    })
    manager.settlePending()
    manager.settlePending()
    manager.settlePending()

    // Closed once (fails), then tried twice more: the second try succeeds.
    expect(onSettled).toHaveBeenCalledTimes(3)
  })

  it("still closes for everyone, and offers the result again later, when saving it throws", () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const { manager, emitted, onSettled } = setup()

    onSettled.mockImplementationOnce(() => {
      throw new Error("disk full")
    })

    expect(manager.close(host)).toBe("accepted")
    expect(
      eventsTo(emitted, "manager", EVENTS.POLL.STATE).map(
        (state) => (state as { phase: string }).phase,
      ),
    ).toEqual(["closed"])
    expect(eventsTo(emitted, "alice-sock", EVENTS.POLL.STATE)).toHaveLength(1)

    // Room closing: the failed record is offered again, and kept this time.
    manager.settlePending()
    manager.settlePending()

    expect(onSettled).toHaveBeenCalledTimes(2)
    expect(logged).toHaveBeenCalledTimes(1)

    logged.mockRestore()
  })

  it("drops who voted for what when the room is gone", () => {
    const { manager } = setup(false)

    manager.vote(alice, "lunch", 0)
    manager.stop()

    expect(manager.snapshotForHost()).toBeNull()
    expect(manager.snapshotForPlayer("alice-client")).toBeNull()
  })
})

describe("PollManager snapshots", () => {
  it("shows a player no counts until the poll has closed", () => {
    const { manager } = setup()

    manager.vote(alice, "lunch", 1)
    const open = manager.snapshotForPlayer("alice-client")

    expect(open).not.toHaveProperty("counts")
    expect(open?.mine).toBe(1)
    expect(manager.snapshotForPlayer("bob-client")?.mine).toBeNull()
  })

  it("sends the tally to the host and nobody else", () => {
    const { manager, emitted } = setup()

    manager.vote(alice, "lunch", 0)

    const tallies = emitted.filter(({ event }) => event === EVENTS.POLL.TALLY)

    expect(tallies.map(({ target }) => target)).toEqual(["manager"])
    expect((tallies[0].payload as PollTally).pollId).toBe("lunch")
  })
})

describe("PollManager snapshots for a socket", () => {
  it("gives the host the host's view, a player their own, and a stranger nothing", () => {
    const { manager } = setup()

    manager.vote(alice, "lunch", 2)

    expect(manager.snapshotForSocket(host)).toMatchObject({
      counts: [0, 0, 1],
      total: 1,
    })
    expect(manager.snapshotForSocket(alice)).toMatchObject({ mine: 2 })
    expect(manager.snapshotForSocket(socketOf("stranger"))).toBeUndefined()
  })

  it("gives null to a host and a player when nothing is showing", () => {
    const { manager } = setup(true, true, false)

    expect(manager.snapshotForSocket(host)).toBeNull()
    expect(manager.snapshotForSocket(alice)).toBeNull()
  })
})
