import { EVENTS } from "@razzia/common/constants"
import type { GameResult, LectureState, Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import Game from "@razzia/socket/services/game"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// What a deck learns from the lecture state: which polls closed in this room,
// and how they came out, so a reloaded frame does not run one twice.

const mocks = vi.hoisted(() => ({
  saveResult: vi.fn<(_result: GameResult) => void>(),
}))

vi.mock("@razzia/socket/services/config", () => ({
  saveResult: mocks.saveResult,
}))

vi.mock("@razzia/socket/services/poll-store", () => ({
  getPollById: vi.fn(),
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

const poll = (id: string, extra: object = {}) => ({
  id,
  question: `Question ${id}?`,
  options: ["Yes", "No"],
  ...extra,
})

// What the room keeps of a closed poll: the wording it was asked in and the
// final counts, never a name.
const doneOf = (id: string, counts: number[], extra: object = {}) => ({
  id,
  question: `Question ${id}?`,
  options: ["Yes", "No"],
  anonymous: true,
  live: false,
  counts,
  total: counts.reduce((sum, count) => sum + count, 0),
  ...extra,
})

const createGame = (lecture = true) => {
  const { io, emitted } = createIo()
  const manager = createClient("manager", "manager-client")
  const game = new Game({
    io,
    socket: manager.socket,
    quizz,
    visuals: {},
    lecture,
    onPollSettled: () => true,
  })
  const alice = createClient("alice-sock", "alice-client")
  const bob = createClient("bob-sock", "bob-client")

  game.join(alice.socket, "Alice")
  game.join(bob.socket, "Bobby")
  emitted.length = 0

  return { game, emitted, manager, alice, bob }
}

type Setup = ReturnType<typeof createGame>

const lectureEvents = (setup: Setup) =>
  setup.emitted
    .filter(
      ({ target, event }) =>
        target === "manager" && event === EVENTS.MANAGER.LECTURE_STATE,
    )
    .map(({ payload }) => payload as LectureState)

const runPoll = (setup: Setup, id: string, extra: object = {}) => {
  setup.game.startInlinePoll(setup.manager.socket, poll(id, extra))
  setup.game.votePoll(setup.alice.socket, id, 0)
  setup.game.votePoll(setup.bob.socket, id, 1)
  setup.game.closePoll(setup.manager.socket)
  setup.game.dismissPoll(setup.manager.socket)
}

const reconnected = (setup: Setup) => {
  const back = createClient("manager-back", "manager-client")

  setup.game.reconnectManager(back.socket)

  return back.emitted.find(
    ({ event }) => event === EVENTS.MANAGER.SUCCESS_RECONNECT,
  )?.payload as { lecture?: LectureState }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("Game telling a deck which polls closed", () => {
  it("lists a poll that closed, with its counts, and pushes it at the close", () => {
    const setup = createGame()

    setup.game.startInlinePoll(setup.manager.socket, poll("one"))
    setup.game.votePoll(setup.alice.socket, "one", 0)
    setup.game.votePoll(setup.bob.socket, "one", 1)

    // Nothing is reported while it is open.
    expect(lectureEvents(setup)).toEqual([])

    setup.game.closePoll(setup.manager.socket)

    expect(lectureEvents(setup)).toEqual([
      expect.objectContaining({
        pollsDone: [doneOf("one", [1, 1])],
      }),
    ])
  })

  it("keeps them oldest first, and never reports a poll that is still showing", () => {
    const setup = createGame()

    runPoll(setup, "one")
    setup.game.startInlinePoll(setup.manager.socket, poll("two"))

    expect(lectureEvents(setup).map((state) => state.pollsDone)).toEqual([
      [doneOf("one", [1, 1])],
    ])

    setup.game.closePoll(setup.manager.socket)

    const idsOf = (state: LectureState) =>
      (state.pollsDone ?? []).map((done) => done.id)

    expect(lectureEvents(setup).map(idsOf)).toEqual([["one"], ["one", "two"]])
  })

  it("carries the list to a manager who reconnects, and keeps it after a dismiss", () => {
    const setup = createGame()

    runPoll(setup, "one")

    expect(reconnected(setup).lecture?.pollsDone).toEqual([
      doneOf("one", [1, 1]),
    ])
  })

  it("lists a sealed poll's counts once it has closed, and a named poll without names", () => {
    const setup = createGame()

    runPoll(setup, "named", { anonymous: false })

    const done = reconnected(setup).lecture?.pollsDone

    expect(done).toEqual([doneOf("named", [1, 1], { anonymous: false })])
    expect(JSON.stringify(done)).not.toContain("voters")
    expect(JSON.stringify(done)).not.toContain("Alice")
    expect(JSON.stringify(done)).not.toContain("Bobby")
  })

  it("refuses a poll past 50 rather than forget one that ran", () => {
    const setup = createGame()

    for (let index = 0; index < 50; index += 1) {
      runPoll(setup, `p${index}`)
    }

    expect(setup.game.startInlinePoll(setup.manager.socket, poll("p50"))).toBe(
      "full",
    )

    const done = reconnected(setup).lecture?.pollsDone ?? []

    expect(done).toHaveLength(50)
    expect(done[0].id).toBe("p0")
    expect(done.at(-1)?.id).toBe("p49")
  })

  it("sends a lecture room without polls exactly the state it always did", () => {
    const setup = createGame()

    expect(reconnected(setup).lecture).toEqual({
      inviteCode: expect.stringMatching(/^\d{6}$/u) as unknown as string,
      total: 2,
      played: [],
      current: null,
      finished: false,
    })
    expect(reconnected(setup).lecture).not.toHaveProperty("pollsDone")
  })

  it("does not list a poll the host never closed, or one that was refused", () => {
    const setup = createGame()

    setup.game.startInlinePoll(setup.manager.socket, poll("open"))
    expect(setup.game.closePoll(setup.alice.socket)).toBe("notManager")
    expect(setup.game.startInlinePoll(setup.manager.socket, poll("busy"))).toBe(
      "busy",
    )

    expect(reconnected(setup).lecture).not.toHaveProperty("pollsDone")
  })

  it("lists a poll once, however many times the host presses close", () => {
    const setup = createGame()

    setup.game.startInlinePoll(setup.manager.socket, poll("one"))
    expect(setup.game.closePoll(setup.manager.socket)).toBe("accepted")
    expect(setup.game.closePoll(setup.manager.socket)).toBe("none")
    expect(setup.game.closePoll(setup.manager.socket)).toBe("none")

    expect(lectureEvents(setup)).toHaveLength(1)
    expect(reconnected(setup).lecture?.pollsDone).toHaveLength(1)
  })

  it("starts a new room's list empty", () => {
    const first = createGame()
    const second = createGame()

    runPoll(first, "one")

    expect(reconnected(second).lecture).not.toHaveProperty("pollsDone")
  })
})
