import {
  FEATURES,
  isPollCommand,
  isRoundCommand,
  parseDeckCommand,
  toForwardedKey,
} from "@razzia/web/features/deck/protocol"
import { afterEach, describe, expect, it } from "vitest"

const envelope = { source: "cst426-deck", v: 1 }

const poll = {
  id: "path-pick",
  question: "Which path fits you?",
  options: ["Full game", "Minigame"],
}

describe("the poll commands", () => {
  it("reads a start with its definition, and the close and dismiss", () => {
    expect(parseDeckCommand({ ...envelope, type: "startPoll", poll })).toEqual({
      ...envelope,
      type: "startPoll",
      poll,
    })
    expect(
      parseDeckCommand({
        ...envelope,
        type: "startPoll",
        poll: { ...poll, anonymous: false, live: true },
      }),
    ).toMatchObject({ poll: { anonymous: false, live: true } })
    expect(parseDeckCommand({ ...envelope, type: "closePoll" })).toEqual({
      ...envelope,
      type: "closePoll",
    })
    expect(parseDeckCommand({ ...envelope, type: "dismissPoll" })).toEqual({
      ...envelope,
      type: "dismissPoll",
    })
  })

  it.each([
    ["no definition", { type: "startPoll" }],
    ["a definition that is a string", { type: "startPoll", poll: "x" }],
    ["an id that is a number", { type: "startPoll", poll: { ...poll, id: 1 } }],
    [
      "a question that is not text",
      { type: "startPoll", poll: { ...poll, question: null } },
    ],
    [
      "options that are not a list",
      { type: "startPoll", poll: { ...poll, options: "ab" } },
    ],
    [
      "options that are not text",
      { type: "startPoll", poll: { ...poll, options: [1, 2] } },
    ],
    [
      "a very long list of options",
      {
        type: "startPoll",
        poll: { ...poll, options: Array.from({ length: 21 }, () => "x") },
      },
    ],
    [
      "anonymous as text",
      { type: "startPoll", poll: { ...poll, anonymous: "no" } },
    ],
    ["live as a number", { type: "startPoll", poll: { ...poll, live: 1 } }],
  ])("drops a start with %s", (_name, body) => {
    expect(parseDeckCommand({ ...envelope, ...body })).toBeNull()
  })

  it("leaves the limits to the server, so a definition that is too long still reaches it", () => {
    expect(
      parseDeckCommand({
        ...envelope,
        type: "startPoll",
        poll: { ...poll, question: "q".repeat(5_000), options: ["a"] },
      }),
    ).not.toBeNull()
  })

  it("tells poll commands from round commands", () => {
    const start = parseDeckCommand({ ...envelope, type: "startPoll", poll })
    const play = parseDeckCommand({ ...envelope, type: "play", question: 0 })

    expect(start && isPollCommand(start)).toBe(true)
    expect(start && isRoundCommand(start)).toBe(false)
    expect(play && isPollCommand(play)).toBe(false)
  })

  it("names only what is built", () => {
    expect(FEATURES).toEqual(["poll", "pollInline", "pollReview"])
  })
})

describe("keys pressed inside a dialog", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  const press = (target: Element | null, key = "ArrowRight") =>
    toForwardedKey({
      key,
      code: key,
      repeat: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      isComposing: false,
      target,
    })

  const mount = (html: string) => {
    document.body.innerHTML = html

    return document.body
  }

  it("still drops them in an ordinary dialog, which owns its keys", () => {
    const body = mount(
      '<div role="dialog"><button id="b">Kick</button></div><div role="alertdialog"><button id="a">Sure</button></div>',
    )

    expect(press(body.querySelector("#b"))).toBeNull()
    expect(press(body.querySelector("#a"), " ")).toBeNull()
  })

  it("forwards them from the poll frame, which hands its keys back", () => {
    const body = mount(
      '<div role="dialog" data-deck-keys><main><button id="b">Close</button></main></div>',
    )

    for (const key of ["ArrowRight", "PageDown", " ", "q", "Q", "Escape"]) {
      expect(press(body.querySelector("#b"), key)).toEqual({
        key,
        code: key,
        repeat: false,
      })
    }
  })

  it("lets a dialog inside the poll frame keep its own keys", () => {
    const body = mount(
      '<div role="dialog" data-deck-keys><div role="alertdialog"><button id="k">Kick</button></div></div>',
    )

    expect(press(body.querySelector("#k"))).toBeNull()
  })

  it("forwards them from outside any dialog, as before", () => {
    const body = mount('<main><button id="b">x</button></main>')

    expect(press(body.querySelector("#b"))).not.toBeNull()
    expect(press(null)).not.toBeNull()
  })
})
