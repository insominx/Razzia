import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  getPollById,
  getPollMeta,
  savePoll,
  updatePoll,
} from "@razzia/socket/services/poll-store"

// A poll is sealed unless it is saved with live: true. Polls written before the
// switch existed have no such field and must stay sealed.

let root = ""

const writePollFile = (file: string, content: unknown) => {
  mkdirSync(join(root, "polls"), { recursive: true })
  writeFileSync(join(root, "polls", file), JSON.stringify(content))
}

const lunch = { question: "Lunch?", options: ["Pizza", "Soup"] }

const stored = (id: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(join(root, "polls", `${id}.json`), "utf-8"),
  ) as Record<string, unknown>

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "razzia-polls-live-"))
  process.env.CONFIG_PATH = root
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

describe("live polls in the store", () => {
  it("reads a poll saved before the switch existed as sealed", () => {
    writePollFile("old.json", lunch)

    expect(getPollById("old")).not.toHaveProperty("live")
    expect(getPollMeta()[0]).not.toHaveProperty("live")
  })

  it("saves, reads and lists live: true", () => {
    const id = savePoll({ ...lunch, live: true }, "lunch-live")

    expect(stored(id).live).toBe(true)
    expect(getPollById(id).live).toBe(true)
    expect(getPollMeta()).toEqual([
      {
        id,
        question: "Lunch?",
        optionCount: 2,
        anonymous: true,
        live: true,
      },
    ])
  })

  it("lists a sealed poll without a live field, and live: false as sealed", () => {
    writePollFile("a.json", { ...lunch, question: "A?", live: false })
    writePollFile("b.json", { ...lunch, question: "B?" })

    for (const meta of getPollMeta()) {
      expect(meta).not.toHaveProperty("live")
    }
  })

  it("turns live off again when an update leaves it out", () => {
    const id = savePoll({ ...lunch, live: true }, "lunch-live")

    updatePoll(id, lunch)

    expect(getPollById(id).live).toBeUndefined()
  })
})
