import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { PollResultRecord } from "@razzia/common/types/poll"
import Game from "@razzia/socket/services/game"
import {
  getPollResultsMeta,
  savePoll,
} from "@razzia/socket/services/poll-store"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The real stores, in a throwaway config folder: a poll goes from a stored
// definition, through a room, to a file a host can open later.

let root = ""

const quizz: Quizz = {
  subject: "Lecture 4",
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

const createIo = () =>
  ({
    to: () => ({ emit: () => undefined }),
    in: () => ({ socketsLeave: () => undefined }),
  }) as unknown as Server

const createClient = (id: string, clientId: string) =>
  ({
    id,
    handshake: { auth: { clientId } },
    join: vi.fn(),
    emit: vi.fn(),
    to: vi.fn(() => ({ emit: vi.fn() })),
  }) as unknown as Socket

const createRoom = () => {
  const manager = createClient("manager", "manager-client")
  const alice = createClient("alice-sock", "alice-client")
  const game = new Game({
    io: createIo(),
    socket: manager,
    quizz,
    visuals: {},
    lecture: true,
  })

  game.join(alice, "Alice")

  return { game, manager, alice }
}

const resultFiles = () => {
  const dir = join(root, "poll-results")

  return existsSync(dir) ? readdirSync(dir) : []
}

const readResult = (file: string) =>
  JSON.parse(
    readFileSync(join(root, "poll-results", file), "utf-8"),
  ) as PollResultRecord

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "razzia-poll-game-"))
  process.env.CONFIG_PATH = root
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  savePoll(
    { question: "Lunch?", options: ["Pizza", "Soup"], anonymous: true },
    "poll-anon0001",
  )
  savePoll(
    { question: "Who first?", options: ["Me", "You"], anonymous: false },
    "poll-named001",
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

describe("a poll that is run", () => {
  it("is kept in poll-results/ when the host closes it", () => {
    const { game, manager, alice } = createRoom()

    game.startPoll(manager, "poll-anon0001")
    game.votePoll(alice, "poll-anon0001", 1)
    game.closePoll(manager)

    expect(resultFiles()).toHaveLength(1)
    expect(readResult(resultFiles()[0])).toMatchObject({
      pollId: "poll-anon0001",
      question: "Lunch?",
      gameSubject: "Lecture 4",
      counts: [0, 1],
      total: 1,
    })
    expect(getPollResultsMeta()).toHaveLength(1)
  })

  it("keeps names for a named poll and none for an anonymous one", () => {
    const { game, manager, alice } = createRoom()

    game.startPoll(manager, "poll-anon0001")
    game.votePoll(alice, "poll-anon0001", 0)
    game.closePoll(manager)
    game.dismissPoll(manager)
    game.startPoll(manager, "poll-named001")
    game.votePoll(alice, "poll-named001", 0)
    game.closePoll(manager)

    const records = resultFiles().map(readResult)
    const anonymous = records.find((r) => r.pollId === "poll-anon0001")
    const named = records.find((r) => r.pollId === "poll-named001")

    expect(anonymous).not.toHaveProperty("voters")
    expect(JSON.stringify(anonymous)).not.toContain("Alice")
    expect(named?.voters).toEqual([{ username: "Alice", option: 0 }])
  })

  it("is kept as a partial result, once, when the room closes on it", () => {
    const { game, manager, alice } = createRoom()

    game.startPoll(manager, "poll-anon0001")
    game.votePoll(alice, "poll-anon0001", 0)
    game.close("errors:game.managerDisconnected")
    game.settlePoll()

    expect(resultFiles()).toHaveLength(1)
    expect(readResult(resultFiles()[0])).toMatchObject({
      partial: true,
      counts: [1, 0],
    })
  })

  it("is not written again when the room closes after it was kept", () => {
    const { game, manager } = createRoom()

    game.startPoll(manager, "poll-anon0001")
    game.closePoll(manager)
    game.close("errors:game.managerDisconnected")
    game.settlePoll()

    expect(resultFiles()).toHaveLength(1)
  })

  it("is offered again, and kept, when the first try could not be written", () => {
    const { game, manager, alice } = createRoom()
    const folder = join(root, "poll-results")

    // A file where the folder should be: the result cannot be written.
    writeFileSync(folder, "in the way")
    game.startPoll(manager, "poll-anon0001")
    game.votePoll(alice, "poll-anon0001", 1)
    game.closePoll(manager)

    // Still the file that was in the way: nothing could be written.
    expect(readFileSync(folder, "utf-8")).toBe("in the way")

    rmSync(folder)
    mkdirSync(folder)
    game.settlePoll()

    expect(resultFiles()).toHaveLength(1)

    game.settlePoll()

    expect(resultFiles()).toHaveLength(1)
  })

  it("leaves nothing when no poll was run", () => {
    const { game } = createRoom()

    game.close("errors:game.managerDisconnected")
    game.settlePoll()

    expect(resultFiles()).toEqual([])
  })
})
