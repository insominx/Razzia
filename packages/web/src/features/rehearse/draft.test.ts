import {
  clearDraft,
  type Draft,
  expireDraft,
  loadDraft,
  openRehearsal,
  parseDraft,
  REHEARSAL_KEY,
  REHEARSAL_PATH,
  REHEARSAL_TARGET,
  saveDraft,
  tidyDraft,
  tidyQuestion,
} from "@razzia/web/features/rehearse/draft"
import { memoryStorage, refusingStorage } from "@razzia/web/test/memory-storage"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const placeholders = {
  subject: "Untitled quiz",
  question: "Your question goes here",
  answer: "Answer",
}

const question = (
  overrides: Partial<Draft["questions"][number]> = {},
): Draft["questions"][number] => ({
  question: "Which one?",
  answers: ["A", "B", "C"],
  solutions: [1],
  cooldown: 5,
  time: 20,
  ...overrides,
})

describe("tidyQuestion", () => {
  it("leaves a finished question as it is", () => {
    expect(tidyQuestion(question(), placeholders)).toEqual({
      question: "Which one?",
      media: undefined,
      answers: ["A", "B", "C"],
      solutions: [1],
      cooldown: 5,
      time: 20,
    })
  })

  it("stands in for what has not been written yet", () => {
    const tidy = tidyQuestion(
      question({ question: "  ", answers: ["", " "], solutions: [] }),
      placeholders,
    )

    expect(tidy.question).toBe("Your question goes here")
    expect(tidy.answers).toEqual(["Answer", "Answer"])
    expect(tidy.solutions).toEqual([0])
  })

  it("pads to two answers and stops at four", () => {
    expect(
      tidyQuestion(question({ answers: ["Only"] }), placeholders).answers,
    ).toEqual(["Only", "Answer"])
    expect(
      tidyQuestion(
        question({ answers: ["1", "2", "3", "4", "5"] }),
        placeholders,
      ).answers,
    ).toEqual(["1", "2", "3", "4"])
  })

  it("drops a solution that points at an answer that is not there", () => {
    expect(
      tidyQuestion(question({ solutions: [1, 7] }), placeholders).solutions,
    ).toEqual([1])
  })

  it("holds the clock to what the server would accept", () => {
    expect(tidyQuestion(question({ cooldown: 1 }), placeholders).cooldown).toBe(
      3,
    )
    expect(
      tidyQuestion(question({ cooldown: 99 }), placeholders).cooldown,
    ).toBe(15)
    expect(tidyQuestion(question({ time: -1 }), placeholders).time).toBe(-1)
    expect(tidyQuestion(question({ time: 0 }), placeholders).time).toBe(20)
  })
})

describe("tidyDraft", () => {
  it("names an untitled quiz and keeps the question the editor was on in range", () => {
    const tidy = tidyDraft(
      { subject: " ", at: 9, questions: [question(), question()] },
      placeholders,
    )

    expect(tidy.subject).toBe("Untitled quiz")
    expect(tidy.at).toBe(1)
    expect(tidy.questions).toHaveLength(2)
  })
})

// As saveDraft keeps it, just now.
const saved = (value: Record<string, unknown>) =>
  JSON.stringify({ ...value, savedAt: Date.now() })

describe("parseDraft", () => {
  it("reads what the editor saved", () => {
    const draft = parseDraft(
      saved({ subject: "Quiz", at: 1, questions: [question()] }),
    )

    expect(draft?.subject).toBe("Quiz")
    expect(draft?.at).toBe(1)
  })

  it("ignores the editor's own question ids", () => {
    const draft = parseDraft(
      saved({
        subject: "Quiz",
        questions: [{ ...question(), id: "abc" }],
      }),
    )

    expect(draft?.questions[0]).not.toHaveProperty("id")
  })

  it("is nothing for nothing, for noise and for a quiz with no questions", () => {
    expect(parseDraft(null)).toBeNull()
    expect(parseDraft("not json")).toBeNull()
    expect(parseDraft(saved({ subject: "Quiz", questions: [] }))).toBeNull()
  })

  it("keeps a bad media entry out rather than refusing the draft", () => {
    const draft = parseDraft(
      saved({
        subject: "Quiz",
        questions: [question({ media: { url: "nope" } })],
      }),
    )

    expect(draft?.questions[0].media).toBeUndefined()
  })
})

describe("saving and opening", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const draft: Draft = { subject: "Quiz", at: 0, questions: [question()] }

  it("round-trips through the browser's storage", () => {
    expect(saveDraft(draft)).toBe(true)
    expect(localStorage.getItem(REHEARSAL_KEY)).not.toBeNull()
    expect(loadDraft()?.subject).toBe("Quiz")
  })

  it("opens the rehearsal in its own named tab once saved", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)

    expect(openRehearsal(draft)).toBe(true)
    expect(open).toHaveBeenCalledWith(REHEARSAL_PATH, REHEARSAL_TARGET)
  })

  it("says so, and opens nothing, when the browser will not keep the draft", () => {
    vi.stubGlobal("localStorage", refusingStorage())
    const open = vi.spyOn(window, "open").mockReturnValue(null)

    expect(openRehearsal(draft)).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })
})

// The draft holds the quiz's answers, and /rehearse needs no login: on a
// shared computer it must not outlive the session it was made in.
describe("how long a draft lasts", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage())
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-07T09:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const draft: Draft = { subject: "Quiz", at: 0, questions: [question()] }
  const HOUR = 60 * 60 * 1_000

  it("expires a draft dated in the future", () => {
    localStorage.setItem(
      REHEARSAL_KEY,
      JSON.stringify({ ...draft, savedAt: Date.now() + 1e12 }),
    )

    expect(loadDraft()).toBeNull()
    expect(localStorage.getItem(REHEARSAL_KEY)).toBeNull()
  })

  it("drops an old draft at startup without anyone opening it", () => {
    saveDraft(draft)
    vi.advanceTimersByTime(4 * HOUR + 1)
    expect(localStorage.getItem(REHEARSAL_KEY)).not.toBeNull()

    expireDraft()

    expect(localStorage.getItem(REHEARSAL_KEY)).toBeNull()
  })

  it("gives no draft, and does not throw, when storage refuses a read", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied")
      },
      removeItem: () => undefined,
    })

    expect(() => loadDraft()).not.toThrow()
    expect(loadDraft()).toBeNull()
  })

  it("lasts through an afternoon of rehearsing", () => {
    saveDraft(draft)
    vi.advanceTimersByTime(4 * HOUR - 1)

    expect(loadDraft()?.subject).toBe("Quiz")
  })

  it("is gone from storage after a few hours", () => {
    saveDraft(draft)
    vi.advanceTimersByTime(4 * HOUR)

    expect(loadDraft()).toBeNull()
    expect(localStorage.getItem(REHEARSAL_KEY)).toBeNull()
  })

  it("arrives from the editor's tab only while it is fresh", () => {
    saveDraft(draft)
    const stored = localStorage.getItem(REHEARSAL_KEY)

    expect(parseDraft(stored)?.subject).toBe("Quiz")
    vi.advanceTimersByTime(4 * HOUR)
    expect(parseDraft(stored)).toBeNull()
  })

  it("does not keep a draft saved with no time on it", () => {
    localStorage.setItem(REHEARSAL_KEY, JSON.stringify(draft))

    expect(loadDraft()).toBeNull()
    expect(localStorage.getItem(REHEARSAL_KEY)).toBeNull()
  })

  it("goes when asked", () => {
    saveDraft(draft)
    clearDraft()

    expect(localStorage.getItem(REHEARSAL_KEY)).toBeNull()
  })
})
