import { EVENTS } from "@razzia/common/constants"
import type { GameResult, LectureState, Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { PollResultRecord, PollWithId } from "@razzia/common/types/poll"
import Game from "@razzia/socket/services/game"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The rules a deck relies on to open its polls straight from the slides and
// come back to their results: a deck poll runs once per room, it takes the
// stage straight from a closed result, a close or dismiss can name the poll it
// means, and the room keeps the wording each poll closed with.

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

const poll = (id: string, extra: object = {}) => ({
  id,
  question: `Question ${id}?`,
  options: ["Yes", "No"],
  ...extra,
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

  game.join(alice.socket, "Alice")
  emitted.length = 0

  return { game, emitted, manager, alice, records }
}

type Setup = ReturnType<typeof createGame>

const pollStates = (setup: Setup, target: string) =>
  setup.emitted
    .filter((e) => e.target === target && e.event === EVENTS.POLL.STATE)
    .map((e) => e.payload as { pollId: string; phase: string } | null)

const reconnected = (setup: Setup) => {
  const back = createClient("manager-back", "manager-client")

  setup.game.reconnectManager(back.socket)

  return back.emitted.find(
    ({ event }) => event === EVENTS.MANAGER.SUCCESS_RECONNECT,
  )?.payload as { lecture?: LectureState; poll?: unknown }
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.getPollById.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("a deck poll's result after it leaves the stage", () => {
  it("keeps the wording it closed with, for the host's screen to show again", () => {
    const setup = createGame()

    setup.game.startInlinePoll(setup.manager.socket, poll("path-pick"))
    setup.game.votePoll(setup.alice.socket, "path-pick", 1)
    setup.game.closePoll(setup.manager.socket)
    setup.game.dismissPoll(setup.manager.socket)

    const back = reconnected(setup)

    expect(back.poll).toBeUndefined()
    expect(back.lecture?.pollsDone).toEqual([
      {
        id: "path-pick",
        question: "Question path-pick?",
        options: ["Yes", "No"],
        anonymous: true,
        live: false,
        counts: [0, 1],
        total: 1,
      },
    ])
  })

  it("never carries a name, even for a named poll", () => {
    const setup = createGame()

    setup.game.startInlinePoll(
      setup.manager.socket,
      poll("named", { anonymous: false }),
    )
    setup.game.votePoll(setup.alice.socket, "named", 0)
    setup.game.closePoll(setup.manager.socket)

    const text = JSON.stringify(reconnected(setup).lecture?.pollsDone)

    expect(text).not.toContain("Alice")
    expect(text).not.toContain("voters")
    expect(text).not.toContain("alice-client")
  })
})

describe("a deck poll runs once per room", () => {
  it("refuses a poll that has already closed here, and saves nothing more", () => {
    const setup = createGame()

    setup.game.startInlinePoll(setup.manager.socket, poll("path-pick"))
    setup.game.closePoll(setup.manager.socket)
    setup.game.dismissPoll(setup.manager.socket)

    expect(
      setup.game.startInlinePoll(setup.manager.socket, poll("path-pick")),
    ).toBe("alreadyRan")
    expect(setup.records).toHaveLength(1)
  })

  it("still lets a stored poll run again", () => {
    const setup = createGame()

    mocks.getPollById.mockReturnValue({
      id: "stored",
      question: "Again?",
      options: ["Yes", "No"],
      anonymous: true,
    })

    expect(setup.game.startPoll(setup.manager.socket, "stored")).toBe(
      "accepted",
    )
    setup.game.closePoll(setup.manager.socket)
    setup.game.dismissPoll(setup.manager.socket)
    expect(setup.game.startPoll(setup.manager.socket, "stored")).toBe(
      "accepted",
    )
  })

  it("starts a new room with every deck poll unrun", () => {
    const first = createGame()
    const second = createGame()

    first.game.startInlinePoll(first.manager.socket, poll("path-pick"))
    first.game.closePoll(first.manager.socket)

    expect(
      second.game.startInlinePoll(second.manager.socket, poll("path-pick")),
    ).toBe("accepted")
  })
})

describe("a deck poll takes the stage from a closed result", () => {
  it("goes from one poll's result to the next with no empty stage between", () => {
    const setup = createGame()

    setup.game.startInlinePoll(setup.manager.socket, poll("one"))
    setup.game.closePoll(setup.manager.socket)
    setup.emitted.length = 0

    expect(setup.game.startInlinePoll(setup.manager.socket, poll("two"))).toBe(
      "accepted",
    )

    // One state each, and it is the new poll: nobody is shown the lobby.
    for (const target of ["manager", "alice-sock"]) {
      expect(pollStates(setup, target)).toEqual([
        expect.objectContaining({ pollId: "two", phase: "open" }),
      ])
    }

    // The first poll was saved at its close, once.
    expect(setup.records.map((record) => record.pollId)).toEqual(["one"])
  })

  it("still waits for an open poll to close", () => {
    const setup = createGame()

    setup.game.startInlinePoll(setup.manager.socket, poll("one"))

    expect(setup.game.startInlinePoll(setup.manager.socket, poll("two"))).toBe(
      "busy",
    )
  })

  it("leaves the stored-poll launcher's rule as it was", () => {
    const setup = createGame()

    mocks.getPollById.mockReturnValue({
      id: "stored",
      question: "Stored?",
      options: ["Yes", "No"],
      anonymous: true,
    })
    setup.game.startInlinePoll(setup.manager.socket, poll("one"))
    setup.game.closePoll(setup.manager.socket)

    expect(setup.game.startPoll(setup.manager.socket, "stored")).toBe("busy")
  })
})

describe("a close or dismiss that names its poll", () => {
  it("cannot close a newer poll that a late command was not meant for", () => {
    const setup = createGame()

    setup.game.startInlinePoll(setup.manager.socket, poll("one"))
    setup.game.closePoll(setup.manager.socket, "one")
    setup.game.dismissPoll(setup.manager.socket, "one")
    setup.game.startInlinePoll(setup.manager.socket, poll("two"))
    setup.emitted.length = 0

    expect(setup.game.closePoll(setup.manager.socket, "one")).toBe("notCurrent")
    expect(setup.game.dismissPoll(setup.manager.socket, "one")).toBe(
      "notCurrent",
    )

    // Nothing moved: no state went out, two is still open and saved nothing.
    expect(pollStates(setup, "manager")).toEqual([])
    expect(setup.records.map((record) => record.pollId)).toEqual(["one"])
    expect(setup.game.votePoll(setup.alice.socket, "two", 0)).toBe("accepted")
  })

  it("acts on the poll it names", () => {
    const setup = createGame()

    setup.game.startInlinePoll(setup.manager.socket, poll("one"))

    expect(setup.game.closePoll(setup.manager.socket, "one")).toBe("accepted")
    expect(setup.game.dismissPoll(setup.manager.socket, "one")).toBe("accepted")
  })

  it("answers none with nothing on the stage, and keeps the unnamed command as it was", () => {
    const setup = createGame()

    expect(setup.game.closePoll(setup.manager.socket, "one")).toBe("none")
    expect(setup.game.dismissPoll(setup.manager.socket, "one")).toBe("none")

    setup.game.startInlinePoll(setup.manager.socket, poll("one"))

    expect(setup.game.closePoll(setup.manager.socket)).toBe("accepted")
    expect(setup.game.dismissPoll(setup.manager.socket)).toBe("accepted")
  })

  it("answers only the host", () => {
    const setup = createGame()

    setup.game.startInlinePoll(setup.manager.socket, poll("one"))

    expect(setup.game.closePoll(setup.alice.socket, "one")).toBe("notManager")
    expect(setup.game.closePoll(setup.alice.socket, "two")).toBe("notManager")
  })
})
