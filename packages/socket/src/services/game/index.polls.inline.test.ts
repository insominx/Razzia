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

type Setup = ReturnType<typeof createGame>

const toManager = (emitted: Emitted[], event: string) =>
  emitted
    .filter((entry) => entry.target === "manager" && entry.event === event)
    .map(({ payload }) => payload)

const playToResults = async (setup: Setup, index: number) => {
  expect(setup.game.playQuestion(setup.manager.socket, index)).toBe("accepted")
  await vi.advanceTimersByTimeAsync(60_000)
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.getPollById.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("Game starting a poll from a definition", () => {
  it("opens it in the lobby, sealed, and never reads or writes a stored poll", () => {
    const setup = createGame()

    expect(setup.game.startInlinePoll(setup.manager.socket, definition)).toBe(
      "accepted",
    )

    expect(mocks.getPollById).not.toHaveBeenCalled()
    expect(toManager(setup.emitted, EVENTS.POLL.STATE)[0]).toEqual({
      pollId: "path-pick",
      question: "Which path fits you?",
      options: ["Full game", "Minigame"],
      anonymous: true,
      phase: "open",
      total: 0,
    })
    expect(
      setup.emitted
        .filter(
          ({ target, event }) =>
            target === "alice-sock" && event === EVENTS.POLL.STATE,
        )
        .map(({ payload }) => payload),
    ).toEqual([
      expect.objectContaining({
        pollId: "path-pick",
        phase: "open",
        mine: null,
      }),
    ])
  })

  it("takes votes, closes, and leaves a result under the deck's id with the text asked", () => {
    const setup = createGame()

    setup.game.startInlinePoll(setup.manager.socket, {
      ...definition,
      anonymous: false,
    })
    setup.game.votePoll(setup.alice.socket, "path-pick", 0)
    setup.game.votePoll(setup.bob.socket, "path-pick", 1)
    expect(setup.game.closePoll(setup.manager.socket)).toBe("accepted")

    expect(setup.records).toHaveLength(1)
    expect(setup.records[0]).toMatchObject({
      pollId: "path-pick",
      question: "Which path fits you?",
      options: ["Full game", "Minigame"],
      anonymous: false,
      gameSubject: "Lecture",
      counts: [1, 1],
      total: 2,
      voters: [
        { username: "Alice", option: 0 },
        { username: "Bobby", option: 1 },
      ],
    })
  })

  it("honors live: true, and is sealed without it", () => {
    const sealed = createGame()
    const live = createGame()

    sealed.game.startInlinePoll(sealed.manager.socket, definition)
    live.game.startInlinePoll(live.manager.socket, {
      ...definition,
      live: true,
    })
    sealed.game.votePoll(sealed.alice.socket, "path-pick", 0)
    live.game.votePoll(live.alice.socket, "path-pick", 0)

    expect(toManager(sealed.emitted, EVENTS.POLL.TALLY)).toEqual([
      { pollId: "path-pick", total: 1 },
    ])
    expect(toManager(live.emitted, EVENTS.POLL.TALLY)).toEqual([
      { pollId: "path-pick", counts: [1, 0], total: 1 },
    ])
  })

  it("starts between questions, as a stored poll does", async () => {
    const setup = createGame()

    await playToResults(setup, 0)

    expect(setup.game.startInlinePoll(setup.manager.socket, definition)).toBe(
      "accepted",
    )
  })

  it("answers busy to a second start, and to a start during a question", () => {
    const setup = createGame()

    expect(setup.game.startInlinePoll(setup.manager.socket, definition)).toBe(
      "accepted",
    )
    expect(
      setup.game.startInlinePoll(setup.manager.socket, {
        ...definition,
        id: "other",
      }),
    ).toBe("busy")
    expect(setup.game.startInlinePoll(setup.manager.socket, definition)).toBe(
      "busy",
    )

    setup.game.closePoll(setup.manager.socket)
    setup.game.dismissPoll(setup.manager.socket)
    setup.game.playQuestion(setup.manager.socket, 0)

    expect(setup.game.startInlinePoll(setup.manager.socket, definition)).toBe(
      "busy",
    )
  })

  it("answers busy after the podium, because the round is over", async () => {
    const setup = createGame()

    await playToResults(setup, 0)
    await playToResults(setup, 1)
    expect(setup.game.finish(setup.manager.socket)).toBe("accepted")
    await vi.advanceTimersByTimeAsync(60_000)

    expect(setup.game.startInlinePoll(setup.manager.socket, definition)).toBe(
      "busy",
    )
  })

  it("answers notLecture in a normal game and notManager to anyone else", () => {
    const normal = createGame(false)
    const lecture = createGame()

    expect(normal.game.startInlinePoll(normal.manager.socket, definition)).toBe(
      "notLecture",
    )
    expect(lecture.game.startInlinePoll(lecture.alice.socket, definition)).toBe(
      "notManager",
    )
    // A stranger learns nothing about whether the definition was any good.
    expect(lecture.game.startInlinePoll(lecture.alice.socket, "nonsense")).toBe(
      "notManager",
    )
    expect(lecture.game.startInlinePoll(lecture.alice.socket, undefined)).toBe(
      "notManager",
    )
  })

  it.each([
    ["an empty question", { ...definition, question: "" }],
    ["seven options", { ...definition, options: "abcdefg".split("") }],
    ["duplicate options", { ...definition, options: ["Yes", "yes"] }],
    ["an unsafe id", { ...definition, id: "../x" }],
    ["a capital in the id", { ...definition, id: "Path" }],
    ["a number for the question", { ...definition, question: 7 }],
    ["a string for the definition", "path-pick"],
    ["nothing", undefined],
    ["null", null],
    ["an array", [definition]],
  ])("answers invalid to %s and leaves the lane free", (_name, bad) => {
    const setup = createGame()

    expect(setup.game.startInlinePoll(setup.manager.socket, bad)).toBe(
      "invalid",
    )
    expect(toManager(setup.emitted, EVENTS.POLL.STATE)).toEqual([])
    expect(setup.game.startInlinePoll(setup.manager.socket, definition)).toBe(
      "accepted",
    )
  })

  it("keeps markup as text and sends it on exactly as typed", () => {
    const setup = createGame()
    const question = "<img src=x onerror=alert(1)> {{x}}"

    setup.game.startInlinePoll(setup.manager.socket, {
      ...definition,
      question,
    })

    expect(toManager(setup.emitted, EVENTS.POLL.STATE)[0]).toMatchObject({
      question,
    })
  })

  it("saves a partial result, under the deck's id, when the room closes on it", () => {
    const setup = createGame()

    setup.game.startInlinePoll(setup.manager.socket, definition)
    setup.game.votePoll(setup.alice.socket, "path-pick", 1)
    setup.game.settlePoll()

    expect(setup.records).toHaveLength(1)
    expect(setup.records[0]).toMatchObject({
      pollId: "path-pick",
      counts: [0, 1],
      partial: true,
    })
  })
})
