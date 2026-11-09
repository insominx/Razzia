import { EVENTS } from "@razzia/common/constants"
import type { Player } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type {
  PollResultRecord,
  PollTally,
  PollWithId,
} from "@razzia/common/types/poll"
import { PollManager } from "@razzia/socket/services/game/poll-manager"
import { describe, expect, it } from "vitest"

// A poll is sealed unless it says `live: true`: while it is open the host's
// screen is told how many have voted and nothing else. Every way the host
// learns of an open poll is checked here, because one leak on any of them
// would show the room an early result.

interface Emitted {
  target: string
  event: string
  payload: unknown
}

const poll = (extra: Partial<PollWithId> = {}): PollWithId => ({
  id: "lunch",
  question: "Lunch?",
  options: ["Pizza", "Soup", "Salad"],
  anonymous: true,
  ...extra,
})

const player = (id: string, name: string): Player => ({
  id,
  clientId: `${name.toLowerCase()}-client`,
  connected: true,
  username: name,
  points: 0,
  streak: 0,
})

const socketOf = (id: string) => ({ id }) as unknown as Socket
const host = socketOf("manager")
const alice = socketOf("alice-sock")
const bob = socketOf("bob-sock")

const setup = (definition: PollWithId = poll()) => {
  const emitted: Emitted[] = []
  const records: PollResultRecord[] = []
  const roster = [
    player("alice-sock", "Alice"),
    player("bob-sock", "Bob"),
    player("carol-sock", "Carol"),
  ]
  const io = {
    to: (target: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ target, event, payload })
      },
    }),
  } as unknown as Server
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
    onSettled: (record) => {
      records.push(record)

      return true
    },
  })

  expect(manager.start(host, definition)).toBe("accepted")

  return { manager, emitted, records }
}

const toHost = (emitted: Emitted[], event: string) =>
  emitted
    .filter((entry) => entry.target === "manager" && entry.event === event)
    .map(({ payload }) => payload)

describe("a sealed poll, the default", () => {
  it.each([
    ["no live field", poll()],
    ["live: false", poll({ live: false })],
  ])("tells the host only how many have voted (%s)", (_name, definition) => {
    const { manager, emitted } = setup(definition)

    expect(toHost(emitted, EVENTS.POLL.STATE)).toEqual([
      {
        pollId: "lunch",
        question: "Lunch?",
        options: ["Pizza", "Soup", "Salad"],
        anonymous: true,
        phase: "open",
        total: 0,
      },
    ])

    manager.vote(alice, "lunch", 1)
    manager.vote(bob, "lunch", 1)

    expect(toHost(emitted, EVENTS.POLL.TALLY)).toEqual([
      { pollId: "lunch", total: 1 },
      { pollId: "lunch", total: 2 },
    ])
  })

  it("keeps counts and names off every payload the host gets while it is open", () => {
    const { manager, emitted } = setup(poll({ anonymous: false }))

    manager.vote(alice, "lunch", 0)
    manager.vote(bob, "lunch", 2)
    manager.vote(alice, "lunch", 1)
    manager.forgetPlayer("bob-client")
    manager.snapshotForSocket(host)

    const everything = JSON.stringify([
      ...emitted.map(({ payload }) => payload),
      manager.snapshotForHost(),
      manager.snapshotForSocket(host),
    ])

    expect(everything).not.toContain('"counts"')
    expect(everything).not.toContain('"voters"')
    expect(everything).not.toContain("Alice")
    expect(everything).not.toContain("Bob")
    expect(manager.snapshotForHost()).toEqual(
      expect.objectContaining({ phase: "open", total: 1 }),
    )
  })

  it("counts votes cast, so a changed vote is still one and a leaver takes theirs", () => {
    const { manager, emitted } = setup()

    manager.vote(alice, "lunch", 0)
    manager.vote(alice, "lunch", 2)
    manager.vote(bob, "lunch", 2)
    manager.forgetPlayer("alice-client")

    expect(toHost(emitted, EVENTS.POLL.TALLY)).toEqual([
      { pollId: "lunch", total: 1 },
      { pollId: "lunch", total: 1 },
      { pollId: "lunch", total: 2 },
      { pollId: "lunch", total: 1 },
    ])
  })

  it("restores the same sealed view to a host page that asks again", () => {
    const { manager } = setup()

    manager.vote(alice, "lunch", 1)

    expect(manager.snapshotForSocket(host)).toEqual({
      pollId: "lunch",
      question: "Lunch?",
      options: ["Pizza", "Soup", "Salad"],
      anonymous: true,
      phase: "open",
      total: 1,
    })
  })

  it("still tells a player only their own pick, and no counts, while open", () => {
    const { manager } = setup()

    manager.vote(alice, "lunch", 1)

    const snapshot = manager.snapshotForPlayer("alice-client")

    expect(snapshot?.mine).toBe(1)
    expect(snapshot).not.toHaveProperty("counts")
    expect(snapshot).not.toHaveProperty("total")
    expect(snapshot).not.toHaveProperty("live")
  })

  it("sends everything at the close: counts, total and, for a named poll, names", () => {
    const { manager, emitted, records } = setup(poll({ anonymous: false }))

    manager.vote(alice, "lunch", 0)
    manager.vote(bob, "lunch", 0)
    emitted.length = 0

    expect(manager.close(host)).toBe("accepted")

    expect(toHost(emitted, EVENTS.POLL.STATE)).toEqual([
      {
        pollId: "lunch",
        question: "Lunch?",
        options: ["Pizza", "Soup", "Salad"],
        anonymous: false,
        phase: "closed",
        counts: [2, 0, 0],
        total: 2,
        voters: [
          { username: "Alice", option: 0 },
          { username: "Bob", option: 0 },
        ],
      },
    ])
    expect(records).toHaveLength(1)
    expect(records[0]).toEqual(
      expect.objectContaining({ counts: [2, 0, 0], total: 2 }),
    )
    // The closed result is the host's to show; a late page gets it all too.
    expect(manager.snapshotForSocket(host)).toEqual(
      expect.objectContaining({ phase: "closed", counts: [2, 0, 0] }),
    )
  })

  it("keeps the full result when the room closes on an open sealed poll", () => {
    const { manager, records } = setup()

    manager.vote(alice, "lunch", 1)
    manager.vote(bob, "lunch", 2)
    manager.settlePending()

    expect(records).toHaveLength(1)
    expect(records[0]).toEqual(
      expect.objectContaining({
        counts: [0, 1, 1],
        total: 2,
        partial: true,
      }),
    )
  })
})

describe("a live poll", () => {
  it("tells the host the counts as the votes come in, and says it is live", () => {
    const { manager, emitted } = setup(poll({ live: true }))

    expect(toHost(emitted, EVENTS.POLL.STATE)[0]).toEqual({
      pollId: "lunch",
      question: "Lunch?",
      options: ["Pizza", "Soup", "Salad"],
      anonymous: true,
      phase: "open",
      counts: [0, 0, 0],
      total: 0,
      live: true,
    })

    manager.vote(alice, "lunch", 1)
    manager.vote(bob, "lunch", 1)

    expect(toHost(emitted, EVENTS.POLL.TALLY).at(-1)).toEqual<PollTally>({
      pollId: "lunch",
      counts: [0, 2, 0],
      total: 2,
    })
    expect(manager.snapshotForSocket(host)).toEqual(
      expect.objectContaining({ counts: [0, 2, 0], total: 2, live: true }),
    )
  })

  it("shows names to the host only in a named poll", () => {
    const { manager } = setup(poll({ live: true, anonymous: false }))

    manager.vote(alice, "lunch", 2)

    expect(manager.snapshotForHost()?.voters).toEqual([
      { username: "Alice", option: 2 },
    ])
  })

  it("still tells a player no counts while it is open", () => {
    const { manager } = setup(poll({ live: true }))

    manager.vote(alice, "lunch", 0)

    expect(manager.snapshotForPlayer("alice-client")).not.toHaveProperty(
      "counts",
    )
  })
})

describe("a sealed poll sends the same bytes whoever voted what", () => {
  it("makes the host's payloads depend on how many voted, not on which option", () => {
    const one = setup()
    const other = setup()

    one.manager.vote(alice, "lunch", 0)
    other.manager.vote(alice, "lunch", 2)

    expect(JSON.stringify(one.emitted)).toBe(JSON.stringify(other.emitted))
  })
})
