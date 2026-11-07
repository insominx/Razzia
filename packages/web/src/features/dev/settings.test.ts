import {
  initialDirectorState,
  pickFixture,
  pickQuiz,
  pickSize,
  sizeOf,
} from "@razzia/web/features/dev/settings"
import { describe, expect, it } from "vitest"

describe("director state", () => {
  it("starts on the first real quiz, on the projector, showing the answers", () => {
    const state = initialDirectorState()

    expect(state.quizId).not.toBe("")
    expect(state.question).toBe(0)
    expect(sizeOf(state.sizeId).view).toBe("host")
    expect(state.fixture).toBe("answers")
  })

  it("keeps the size when the screen exists on it", () => {
    const state = pickFixture(initialDirectorState(), "leaderboard")

    expect(state.fixture).toBe("leaderboard")
    expect(sizeOf(state.sizeId).id).toBe(initialDirectorState().sizeId)
  })

  it("moves a host frame to a phone for a phone-only screen", () => {
    const state = pickFixture(initialDirectorState(), "result")

    expect(state.fixture).toBe("result")
    expect(sizeOf(state.sizeId).view).toBe("phone")
  })

  it("moves a phone frame to the host for a host-only screen", () => {
    const phone = pickSize(initialDirectorState(), "phone-844")
    const state = pickFixture(phone, "responses")

    expect(sizeOf(state.sizeId).view).toBe("host")
  })

  it("falls back to Answers when the new size lacks the screen", () => {
    const host = pickFixture(initialDirectorState(), "leaderboard")
    const state = pickSize(host, "phone-640")

    expect(state.sizeId).toBe("phone-640")
    expect(state.fixture).toBe("answers")
  })

  it("keeps the screen when the new size has it", () => {
    const state = pickSize(initialDirectorState(), "host-720")

    expect(state.fixture).toBe("answers")
    expect(state.sizeId).toBe("host-720")
  })

  it("restarts at the first question for a new quiz", () => {
    const state = pickQuiz({ ...initialDirectorState(), question: 4 }, "x")

    expect(state).toMatchObject({ quizId: "x", question: 0 })
  })
})
