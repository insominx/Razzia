import { STATUS } from "@razzia/common/types/game/status"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@razzia/web/features/deck/embed", () => ({ IS_DECK_EMBED: true }))

const results = (questionNumber: number) => ({
  questionNumber,
  question: `Q${questionNumber}`,
  responses: { 0: 2 },
  solutions: [0],
  answers: ["a", "b"],
})

const stubSession = () => {
  const entries = new Map<string, string>()
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
  })

  return entries
}

const importStore = async () =>
  (await import("@razzia/web/features/game/stores/manager")).useManagerStore

describe("a deck frame's results across a reload", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("brings back the results of the game it hosts", async () => {
    stubSession()
    const before = await importStore()
    before.getState().setGameId("g-1")
    before.getState().setStatus(STATUS.SHOW_RESPONSES, results(1))
    before.getState().setStatus(STATUS.SHOW_RESPONSES, results(3))

    vi.resetModules()
    const after = await importStore()
    expect(after.getState().responses).toEqual({})
    after.getState().setGameId("g-1")

    expect(Object.keys(after.getState().responses)).toEqual(["0", "2"])
    expect(after.getState().responses[2]?.question).toBe("Q3")
  })

  it("does not bring them back for another game", async () => {
    stubSession()
    const before = await importStore()
    before.getState().setGameId("g-1")
    before.getState().setStatus(STATUS.SHOW_RESPONSES, results(1))

    vi.resetModules()
    const after = await importStore()
    after.getState().setGameId("g-2")

    expect(after.getState().responses).toEqual({})
  })

  it("keeps working without storage", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    })
    const store = await importStore()
    store.getState().setGameId("g-1")
    store.getState().setStatus(STATUS.SHOW_RESPONSES, results(1))

    expect(Object.keys(store.getState().responses)).toEqual(["0"])
  })
})
