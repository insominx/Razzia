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
import type { PollResultRecord } from "@razzia/common/types/poll"
import {
  deletePollResult,
  getPollResultById,
  getPollResultsMeta,
  savePollResult,
} from "@razzia/socket/services/poll-store"
import { ItemNotFoundError } from "@razzia/socket/utils/safe"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let root = ""

const record = (
  id: string,
  extra: Partial<PollResultRecord> = {},
): PollResultRecord => ({
  id,
  pollId: "lunch",
  question: "Lunch?",
  options: ["Pizza", "Soup"],
  anonymous: true,
  date: "2026-11-08T12:00:00.000Z",
  gameSubject: "Lecture 4",
  counts: [3, 1],
  total: 4,
  ...extra,
})

const onDisk = (id: string): unknown =>
  JSON.parse(readFileSync(join(root, "poll-results", `${id}.json`), "utf-8"))

const writeRaw = (file: string, content: unknown) => {
  mkdirSync(join(root, "poll-results"), { recursive: true })
  writeFileSync(
    join(root, "poll-results", file),
    typeof content === "string" ? content : JSON.stringify(content),
  )
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "razzia-poll-results-"))
  process.env.CONFIG_PATH = root
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

describe("savePollResult", () => {
  it("makes the folder on the first save and keeps the result under its id", () => {
    expect(existsSync(join(root, "poll-results"))).toBe(false)

    expect(savePollResult(record("1700-aaaa1111"))).toBe(true)

    expect(onDisk("1700-aaaa1111")).toEqual(record("1700-aaaa1111"))
  })

  it("keeps who voted for what in a named poll", () => {
    const voters = [{ username: "Alice", option: 0 }]

    savePollResult(record("1700-named001", { anonymous: false, voters }))

    expect(onDisk("1700-named001")).toMatchObject({ voters })
  })

  it("never writes names for an anonymous poll, whatever it is given", () => {
    savePollResult(
      record("1700-anon0001", {
        anonymous: true,
        voters: [{ username: "Alice", option: 0 }],
      }),
    )

    expect(onDisk("1700-anon0001")).not.toHaveProperty("voters")
    expect(
      readFileSync(join(root, "poll-results", "1700-anon0001.json"), "utf-8"),
    ).not.toContain("Alice")
  })

  it("keeps a partial result marked as one", () => {
    savePollResult(record("1700-part0001", { partial: true }))

    expect(onDisk("1700-part0001")).toMatchObject({ partial: true })
  })

  it("says it could not, instead of throwing, when it cannot write", () => {
    // A file where the folder should be: the folder cannot be made.
    writeFileSync(join(root, "poll-results"), "not a folder")

    expect(savePollResult(record("1700-aaaa1111"))).toBe(false)
  })

  it("will not write a record that is not a result, or one with an id that is a path", () => {
    expect(savePollResult({ ...record("1700-aaaa1111"), counts: [-1] })).toBe(
      false,
    )
    expect(savePollResult(record("../game"))).toBe(false)
    expect(existsSync(join(root, "poll-results"))).toBe(false)
  })

  it("leaves no half-written file behind", () => {
    savePollResult(record("1700-aaaa1111"))

    expect(
      readdirSync(join(root, "poll-results")).every((name) =>
        name.endsWith(".json"),
      ),
    ).toBe(true)
  })
})

describe("getPollResultsMeta", () => {
  it("is empty when nothing has been kept", () => {
    expect(getPollResultsMeta()).toEqual([])
  })

  it("lists the results newest first, with what the list shows", () => {
    savePollResult(record("old", { date: "2026-11-01T09:00:00.000Z" }))
    savePollResult(
      record("new", {
        date: "2026-11-08T09:00:00.000Z",
        question: "Dinner?",
        anonymous: false,
        partial: true,
        total: 9,
      }),
    )

    expect(getPollResultsMeta()).toEqual([
      {
        id: "new",
        pollId: "lunch",
        question: "Dinner?",
        date: "2026-11-08T09:00:00.000Z",
        gameSubject: "Lecture 4",
        total: 9,
        anonymous: false,
        partial: true,
      },
      {
        id: "old",
        pollId: "lunch",
        question: "Lunch?",
        date: "2026-11-01T09:00:00.000Z",
        gameSubject: "Lecture 4",
        total: 4,
        anonymous: true,
      },
    ])
  })

  it("skips a file that is not a result, and never throws", () => {
    savePollResult(record("good"))
    writeRaw("broken.json", "{ not json")
    writeRaw("invalid.json", { question: "no" })
    writeRaw("notes.txt", "ignored")

    expect(getPollResultsMeta().map((meta) => meta.id)).toEqual(["good"])

    rmSync(join(root, "poll-results"), { recursive: true })
    writeFileSync(join(root, "poll-results"), "not a folder")

    expect(() => getPollResultsMeta()).not.toThrow()
    expect(getPollResultsMeta()).toEqual([])
  })

  it("lists a result with a bad date last instead of dropping it", () => {
    savePollResult(record("dated", { date: "2026-11-08T09:00:00.000Z" }))
    savePollResult(record("undated", { date: "not a date" }))

    expect(getPollResultsMeta().map((meta) => meta.id)).toEqual([
      "dated",
      "undated",
    ])
  })
})

describe("getPollResultById", () => {
  it("reads a result, named after its file", () => {
    savePollResult(record("1700-aaaa1111"))

    expect(getPollResultById("1700-aaaa1111")).toEqual(record("1700-aaaa1111"))
  })

  it("gives no names for an anonymous poll even if the file has them", () => {
    writeRaw(
      "hand-edited.json",
      record("hand-edited", {
        voters: [{ username: "Alice", option: 0 }],
      }),
    )

    expect(getPollResultById("hand-edited")).not.toHaveProperty("voters")
  })

  it("throws for a missing result, an invalid one and an id that is a path", () => {
    writeRaw("invalid.json", { question: "no" })

    expect(() => getPollResultById("missing")).toThrow()
    expect(() => getPollResultById("invalid")).toThrow()
    expect(() => getPollResultById("../game")).toThrow()
  })

  it("finds a result only under its own name, whatever the file system thinks of case", () => {
    savePollResult(record("1700-aaaa1111"))

    expect(getPollResultById("1700-aaaa1111").id).toBe("1700-aaaa1111")
    expect(() => getPollResultById("1700-AAAA1111")).toThrow()
    expect(() => deletePollResult("1700-AAAA1111")).toThrow(ItemNotFoundError)
    expect(readdirSync(join(root, "poll-results"))).toEqual([
      "1700-aaaa1111.json",
    ])
  })

  it("keeps a client's line break out of the message the server logs", () => {
    const messageOf = (call: () => unknown): string => {
      try {
        call()
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }

      return ""
    }
    const id = "gone\nFORGED manager logged in"

    for (const message of [
      messageOf(() => getPollResultById(id)),
      messageOf(() => deletePollResult(id)),
    ]) {
      expect(message).toContain("gone")
      expect(message).not.toContain("\n")
    }
  })
})

describe("deletePollResult", () => {
  it("removes a result", () => {
    savePollResult(record("1700-aaaa1111"))

    deletePollResult("1700-aaaa1111")

    expect(existsSync(join(root, "poll-results", "1700-aaaa1111.json"))).toBe(
      false,
    )
    expect(getPollResultsMeta()).toEqual([])
  })

  it("says one that is already gone is not found, and refuses an id that is a path", () => {
    expect(() => deletePollResult("missing")).toThrow(ItemNotFoundError)
    expect(() => deletePollResult("../game")).toThrow()
  })
})
