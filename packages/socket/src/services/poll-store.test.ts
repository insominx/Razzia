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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  deletePoll,
  getPollById,
  getPollMeta,
  savePoll,
  updatePoll,
} from "@razzia/socket/services/poll-store"
import { ItemNotFoundError } from "@razzia/socket/utils/safe"

let root = ""

const writePollFile = (file: string, content: unknown) => {
  mkdirSync(join(root, "polls"), { recursive: true })
  writeFileSync(
    join(root, "polls", file),
    typeof content === "string" ? content : JSON.stringify(content),
  )
}

const lunch = { question: "Lunch?", options: ["Pizza", "Soup"] }

const stored = (id: string): unknown =>
  JSON.parse(readFileSync(join(root, "polls", `${id}.json`), "utf-8"))

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "razzia-polls-"))
  process.env.CONFIG_PATH = root
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

describe("getPollById", () => {
  it("reads a poll and names it after its file", () => {
    writePollFile("lunch.json", lunch)

    expect(getPollById("lunch")).toEqual({
      id: "lunch",
      question: "Lunch?",
      options: ["Pizza", "Soup"],
      anonymous: true,
    })
  })

  it("throws for a missing poll, an invalid poll and an unsafe id", () => {
    writePollFile("bad.json", { question: "", options: ["A"] })

    expect(() => getPollById("nope")).toThrow()
    expect(() => getPollById("bad")).toThrow()
    expect(() => getPollById("../game")).toThrow()
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
      messageOf(() => getPollById(id)),
      messageOf(() => deletePoll(id)),
    ]) {
      expect(message).toContain("gone")
      expect(message).not.toContain("\n")
    }
  })
})

describe("getPollMeta", () => {
  it("is empty when there is no polls folder", () => {
    expect(getPollMeta()).toEqual([])
  })

  it("lists the polls by question and skips a bad file", () => {
    writePollFile("b.json", { question: "Beta?", options: ["1", "2", "3"] })
    writePollFile("a.json", {
      question: "Alpha?",
      options: ["1", "2"],
      anonymous: false,
    })
    writePollFile("broken.json", "{ not json")
    writePollFile("invalid.json", { question: "Only one", options: ["1"] })
    writePollFile("notes.txt", "ignored")

    expect(getPollMeta()).toEqual([
      { id: "a", question: "Alpha?", optionCount: 2, anonymous: false },
      { id: "b", question: "Beta?", optionCount: 3, anonymous: true },
    ])
  })

  it("never throws, even when the folder cannot be read", () => {
    // A file where the folder should be: readdir fails.
    writeFileSync(join(root, "polls"), "not a folder")

    expect(() => getPollMeta()).not.toThrow()
    expect(getPollMeta()).toEqual([])
  })
})

describe("savePoll", () => {
  it("makes the polls folder on the first save, and stores the poll as validated", () => {
    expect(existsSync(join(root, "polls"))).toBe(false)

    const id = savePoll(
      { question: "  Lunch?  ", options: [" Pizza ", "Soup"] },
      "poll-abcdef123456",
    )

    expect(id).toBe("poll-abcdef123456")
    expect(stored(id)).toEqual({
      question: "Lunch?",
      options: ["Pizza", "Soup"],
      anonymous: true,
    })
  })

  it("keeps who-sees-what as the author set it", () => {
    savePoll({ ...lunch, anonymous: false }, "poll-named0001")

    expect(stored("poll-named0001")).toMatchObject({ anonymous: false })
  })

  it("lands a save sent again on the same poll, never a second one", () => {
    savePoll(lunch, "poll-abcdef123456")
    savePoll({ ...lunch, question: "Lunch now?" }, "poll-abcdef123456")

    expect(readdirSync(join(root, "polls"))).toEqual(["poll-abcdef123456.json"])
    expect(stored("poll-abcdef123456")).toMatchObject({
      question: "Lunch now?",
    })
  })

  it("names a poll itself when the caller does not", () => {
    const id = savePoll(lunch)

    expect(id).toMatch(/^poll-[\w-]{12}$/u)
    expect(getPollById(id)).toMatchObject({ question: "Lunch?" })
  })

  it("turns away a poll that does not validate, with the reason as a key, and writes nothing", () => {
    expect(() =>
      savePoll(
        { question: "Lunch?", options: ["Only one"] },
        "poll-abcdef123456",
      ),
    ).toThrow("errors:poll.tooFewOptions")
    expect(existsSync(join(root, "polls"))).toBe(false)
  })

  it.each(["../game", "short", "has space!", "x".repeat(65), 42, ""])(
    "turns away a name that is not a plain new-poll name (%s)",
    (name) => {
      expect(() => savePoll(lunch, name)).toThrow("errors:poll.failedToSave")
      expect(existsSync(join(root, "polls"))).toBe(false)
    },
  )

  it("leaves no half-written file behind", () => {
    savePoll(lunch, "poll-abcdef123456")

    expect(
      readdirSync(join(root, "polls")).every((name) => name.endsWith(".json")),
    ).toBe(true)
  })

  it("is read back by id and listed", () => {
    savePoll({ ...lunch, anonymous: false }, "poll-abcdef123456")

    expect(getPollById("poll-abcdef123456")).toEqual({
      id: "poll-abcdef123456",
      ...lunch,
      anonymous: false,
    })
    expect(getPollMeta()).toEqual([
      {
        id: "poll-abcdef123456",
        question: "Lunch?",
        optionCount: 2,
        anonymous: false,
      },
    ])
  })
})

describe("updatePoll", () => {
  it("replaces a stored poll", () => {
    savePoll(lunch, "poll-abcdef123456")

    updatePoll("poll-abcdef123456", {
      question: "Dinner?",
      options: ["Rice", "Noodles", "Salad"],
    })

    expect(stored("poll-abcdef123456")).toMatchObject({
      question: "Dinner?",
      options: ["Rice", "Noodles", "Salad"],
    })
  })

  it("will not make a poll that is not there, and says so with a key", () => {
    expect(() => updatePoll("poll-missing0001", lunch)).toThrow(
      "errors:poll.notFound",
    )
    expect(existsSync(join(root, "polls"))).toBe(false)
  })

  it("turns away a poll that does not validate, and an unsafe id", () => {
    savePoll(lunch, "poll-abcdef123456")

    expect(() =>
      updatePoll("poll-abcdef123456", { question: "", options: ["a", "b"] }),
    ).toThrow("errors:poll.questionEmpty")
    expect(() => updatePoll("../game", lunch)).toThrow()
    expect(stored("poll-abcdef123456")).toMatchObject({ question: "Lunch?" })
  })
})

describe("deletePoll", () => {
  it("removes a stored poll", () => {
    savePoll(lunch, "poll-abcdef123456")

    deletePoll("poll-abcdef123456")

    expect(existsSync(join(root, "polls", "poll-abcdef123456.json"))).toBe(
      false,
    )
    expect(getPollMeta()).toEqual([])
  })

  it("says a poll that is already gone is not found, so a second delete can be told from a failure", () => {
    expect(() => deletePoll("poll-missing0001")).toThrow(ItemNotFoundError)
  })

  it("turns away an id that is a path", () => {
    expect(() => deletePoll("../game")).toThrow()
  })
})
