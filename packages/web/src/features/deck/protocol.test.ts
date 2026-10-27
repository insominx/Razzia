import {
  parseDeckCommand,
  toForwardedKey,
} from "@razzia/web/features/deck/protocol"
import { describe, expect, it } from "vitest"

const command = (body: Record<string, unknown>) => ({
  source: "cst426-deck",
  v: 1,
  ...body,
})

describe("parseDeckCommand", () => {
  it.each([
    command({ type: "hello" }),
    command({
      type: "ensureGame",
      quiz: "vehicle-physics",
      restart: "ifFinished",
    }),
    command({ type: "ensureGame", quiz: "vehicle-physics" }),
    command({ type: "ensureGame", quiz: "vehicle-physics", restart: "always" }),
    command({ type: "close", quiz: "vehicle-physics" }),
    command({ type: "play", question: 0 }),
    command({ type: "leaderboard" }),
    command({ type: "finish" }),
    command({ type: "visibility", visible: false }),
    command({ type: "review", question: 2 }),
    command({ type: "review", question: null }),
  ])("accepts %o", (data) => {
    expect(parseDeckCommand(data)).toEqual(data)
  })

  it.each([
    ["an unknown command", command({ type: "skip" })],
    ["another sender", { source: "someone", v: 1, type: "hello" }],
    [
      "another protocol version",
      { source: "cst426-deck", v: 2, type: "hello" },
    ],
    ["a negative question", command({ type: "play", question: -1 })],
    ["a fractional question", command({ type: "play", question: 1.5 })],
    ["an empty quiz", command({ type: "ensureGame", quiz: "" })],
    ["a close without its quiz", command({ type: "close" })],
    ["a review without its question", command({ type: "review" })],
    ["a negative review", command({ type: "review", question: -1 })],
    ["a plain string", "hello"],
  ])("refuses %s", (_label, data) => {
    expect(parseDeckCommand(data)).toBeNull()
  })
})

const keyEvent = (
  overrides: Partial<Parameters<typeof toForwardedKey>[0]> = {},
) => ({
  key: "PageDown",
  code: "PageDown",
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  isComposing: false,
  target: document.body,
  ...overrides,
})

describe("toForwardedKey", () => {
  it.each([
    "PageDown",
    "PageUp",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    " ",
    "Home",
    "End",
    "Escape",
    "q",
    "Q",
  ])("hands %j to the deck", (key) => {
    expect(toForwardedKey(keyEvent({ key, code: "Code" }))).toEqual({
      key,
      code: "Code",
      repeat: false,
    })
  })

  it.each(["Enter", "Tab", "r", "1", "a"])("keeps %j", (key) => {
    expect(toForwardedKey(keyEvent({ key }))).toBeNull()
  })

  it.each(["input", "textarea", "select"])(
    "never takes keys typed into a %s",
    (tag) => {
      expect(
        toForwardedKey(keyEvent({ target: document.createElement(tag) })),
      ).toBeNull()
    },
  )

  it("never takes keys typed into editable text", () => {
    const editable = document.createElement("div")
    Object.defineProperty(editable, "isContentEditable", { value: true })

    expect(toForwardedKey(keyEvent({ target: editable }))).toBeNull()
  })

  it("leaves shortcuts with a modifier alone", () => {
    expect(toForwardedKey(keyEvent({ ctrlKey: true }))).toBeNull()
    expect(toForwardedKey(keyEvent({ metaKey: true }))).toBeNull()
    expect(toForwardedKey(keyEvent({ altKey: true }))).toBeNull()
    expect(toForwardedKey(keyEvent({ isComposing: true }))).toBeNull()
  })

  it("passes a held key on as a repeat", () => {
    expect(toForwardedKey(keyEvent({ repeat: true }))).toMatchObject({
      repeat: true,
    })
  })
})
