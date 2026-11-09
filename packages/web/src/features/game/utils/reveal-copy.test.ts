import {
  analyzeCrowd,
  headlineFor,
  listLetters,
} from "@razzia/web/features/game/utils/reveal-copy"
import { describe, expect, it } from "vitest"

describe("analyzeCrowd", () => {
  it("counts who answered and who was right", () => {
    const crowd = analyzeCrowd({ 0: 3, 1: 8, 2: 4, 3: 2 }, [0], {
      answerCount: 4,
      totalPlayers: 18,
    })

    expect(crowd).toMatchObject({
      answered: 17,
      right: 3,
      of: 18,
      top: [1],
      crowdRight: false,
      allIn: false,
    })
    expect(crowd.topWrong).toEqual({ slots: [1], count: 8 })
  })

  it("holds the light on a right answer the crowd also picked", () => {
    const crowd = analyzeCrowd({ 0: 12, 1: 3, 2: 2, 3: 1 }, [0], {
      answerCount: 4,
      totalPlayers: 18,
    })

    expect(crowd.top).toEqual([0])
    expect(crowd.crowdRight).toBe(true)
    expect(crowd.topWrong).toEqual({ slots: [1], count: 3 })
  })

  it("keeps every tied answer lit, and counts the crowd right if one is", () => {
    const tied = analyzeCrowd({ 0: 5, 1: 5, 2: 3 }, [0], {
      answerCount: 3,
      totalPlayers: 13,
    })

    expect(tied.top).toEqual([0, 1])
    expect(tied.crowdRight).toBe(true)

    const bothWrong = analyzeCrowd({ 0: 1, 1: 5, 2: 5 }, [0], {
      answerCount: 3,
      totalPlayers: 11,
    })

    expect(bothWrong.top).toEqual([1, 2])
    expect(bothWrong.crowdRight).toBe(false)
    expect(bothWrong.topWrong).toEqual({ slots: [1, 2], count: 5 })
  })

  it("handles several right answers", () => {
    const crowd = analyzeCrowd({ 0: 4, 1: 1, 2: 6 }, [0, 2], {
      answerCount: 3,
      totalPlayers: 11,
    })

    expect(crowd.right).toBe(10)
    expect(crowd.crowdRight).toBe(true)
    expect(crowd.topWrong).toEqual({ slots: [1], count: 1 })
  })

  it("says nobody was fooled when every answer was a right one", () => {
    const crowd = analyzeCrowd({ 0: 9 }, [0], {
      answerCount: 2,
      totalPlayers: 9,
    })

    expect(crowd.topWrong).toBeNull()
    expect(crowd.allIn).toBe(true)
  })

  it("is all in only when every player answered", () => {
    expect(
      analyzeCrowd({ 0: 5, 1: 4 }, [0], { answerCount: 2, totalPlayers: 9 })
        .allIn,
    ).toBe(true)
    expect(
      analyzeCrowd({ 0: 5, 1: 3 }, [0], { answerCount: 2, totalPlayers: 9 })
        .allIn,
    ).toBe(false)
  })

  it("takes the room's size from the answers when the payload has none", () => {
    expect(analyzeCrowd({ 0: 2, 1: 1 }, [0], { answerCount: 2 }).of).toBe(3)
  })

  it("copes with nobody answering, and with a missing slot", () => {
    const empty = analyzeCrowd({}, [0], { answerCount: 4, totalPlayers: 18 })

    expect(empty).toMatchObject({
      answered: 0,
      right: 0,
      top: [],
      allIn: false,
    })
    expect(empty.topWrong).toBeNull()
    expect(empty.crowdRight).toBe(false)
  })
})

describe("headlineFor", () => {
  it("names the answer that fooled the room: the plan's own line", () => {
    const crowd = analyzeCrowd({ 0: 3, 1: 8, 2: 4, 3: 2 }, [0], {
      answerCount: 4,
      totalPlayers: 18,
    })

    expect(headlineFor(crowd)).toEqual({
      kind: "crowdWrong",
      right: 3,
      of: 18,
      wrong: 8,
      letters: ["B"],
    })
  })

  it("names every answer that tied for the biggest wrong bar", () => {
    const crowd = analyzeCrowd({ 0: 1, 1: 5, 2: 5 }, [0], {
      answerCount: 3,
      totalPlayers: 11,
    })

    expect(headlineFor(crowd)).toMatchObject({
      kind: "crowdWrong",
      wrong: 5,
      letters: ["B", "C"],
    })
  })

  it("is plain when the crowd was right", () => {
    const crowd = analyzeCrowd({ 0: 12, 1: 3, 2: 2, 3: 1 }, [0], {
      answerCount: 4,
      totalPlayers: 18,
    })

    expect(headlineFor(crowd)).toMatchObject({
      kind: "crowdRight",
      right: 12,
      of: 18,
    })
  })

  it("says everyone got it only when the whole room did", () => {
    expect(
      headlineFor(
        analyzeCrowd({ 0: 18 }, [0], { answerCount: 4, totalPlayers: 18 }),
      ).kind,
    ).toBe("everyone")
    // One person left without answering: not everyone.
    expect(
      headlineFor(
        analyzeCrowd({ 0: 17 }, [0], { answerCount: 4, totalPlayers: 18 }),
      ).kind,
    ).toBe("crowdRight")
  })

  it("says nobody answered when the room was silent", () => {
    expect(
      headlineFor(analyzeCrowd({}, [0], { answerCount: 4, totalPlayers: 18 }))
        .kind,
    ).toBe("nobody")
  })
})

describe("listLetters", () => {
  it("lists the way the language does", () => {
    expect(listLetters(["B"], "en")).toBe("B")
    expect(listLetters(["B", "C"], "en")).toBe("B and C")
    expect(listLetters(["B", "C"], "de")).toBe("B und C")
    expect(listLetters(["B", "C", "D"], "en")).toBe("B, C, and D")
  })

  it("falls back to a plain list for a language it does not know", () => {
    expect(listLetters(["B", "C"], "not a language")).toBe("B, C")
  })
})
