import {
  FIT_SIZES,
  fitPasses,
  type FitSize,
  type FrameMeasurement,
} from "@razzia/web/features/dev/fit"
import type { FixtureRef } from "@razzia/web/features/dev/fixtures"
import {
  countFitChecks,
  FIT_FIXTURE,
  type FitFrame,
  runFit,
} from "@razzia/web/features/dev/run-fit"
import { describe, expect, it, vi } from "vitest"

const questions = [
  { quizId: "a", index: 0, question: {} as never },
  { quizId: "a", index: 1, question: {} as never },
  { quizId: "b", index: 0, question: {} as never },
]

/** A frame whose page height depends on what was last shown. */
const fakeFrame = (
  sizeId: string,
  heightFor: (ref: FixtureRef | undefined) => number,
): FitFrame & { shown: FixtureRef[] } => {
  const size = FIT_SIZES.find((candidate) => candidate.id === sizeId)

  if (!size) {
    throw new Error(sizeId)
  }

  const shown: FixtureRef[] = []

  return {
    size,
    shown,
    api: {
      showFixture: (ref) => shown.push(ref),
      settle: () => Promise.resolve(),
      measure: (): FrameMeasurement => ({
        client: { width: size.width, height: size.height },
        scroll: { width: size.width, height: heightFor(shown.at(-1)) },
        tiles: [],
        rows: [],
        boxes: [],
      }),
    },
  }
}

/** A frame whose page is exactly as tall as its viewport. */
const fittingFrame = ({ id, height }: FitSize) => fakeFrame(id, () => height)

describe("runFit", () => {
  it("checks every question on every screen of every size", async () => {
    const frames = FIT_SIZES.map(fittingFrame)
    const report = await runFit({ frames, questions })

    // Host: 3 screens x 2 sizes; phone: 3 screens x 2 sizes
    expect(report.rows).toHaveLength((3 * 2 + 3 * 2) * questions.length)
    expect(countFitChecks(FIT_SIZES, questions.length)).toBe(report.rows.length)
    expect(fitPasses(report.rows)).toBe(true)
  })

  it("shows each screen through its own fixture", async () => {
    const frame = fakeFrame("host-1080", () => 1080)

    await runFit({ frames: [frame], questions: questions.slice(0, 1) })

    expect(frame.shown.map((ref) => ref.fixture)).toEqual([
      FIT_FIXTURE.question,
      FIT_FIXTURE.answers,
      FIT_FIXTURE.responses,
    ])
  })

  it("keeps the phone out of the results screen", async () => {
    const frame = fakeFrame("phone-844", () => 844)

    await runFit({ frames: [frame], questions: questions.slice(0, 1) })

    expect(frame.shown.map((ref) => ref.fixture)).not.toContain("responses")
  })

  it("attributes an overflow to the question that caused it", async () => {
    const frame = fakeFrame("host-1080", (ref) =>
      ref?.fixture === "responses" && ref.quizId === "a" && ref.question === 1
        ? 1233
        : 1080,
    )
    const report = await runFit({ frames: [frame], questions })
    const failing = report.rows.filter((row) => !row.result.ok)

    expect(failing).toHaveLength(1)
    expect(failing[0]).toMatchObject({
      quiz: "a",
      question: 2,
      screen: "responses",
      size: "host-1080",
    })
    expect(failing[0].result.overflowY).toBe(153)
    expect(fitPasses(report.rows)).toBe(false)
  })

  it("orders the report by size, screen and question", async () => {
    const frames = [
      fakeFrame("phone-844", () => 844),
      fakeFrame("host-1080", () => 1080),
    ]
    const report = await runFit({ frames, questions })

    expect(report.rows[0]).toMatchObject({
      size: "host-1080",
      screen: "question",
      quiz: "a",
      question: 1,
    })
    expect(report.rows.at(-1)).toMatchObject({
      size: "phone-844",
      screen: "wait",
      quiz: "b",
    })
  })

  it("reports progress and stops when aborted", async () => {
    const onProgress = vi.fn()
    const controller = new AbortController()
    const frame = fakeFrame("host-1080", () => 1080)
    const abortAfterFirst = vi.fn(() => {
      controller.abort()
    })

    const report = await runFit({
      frames: [frame],
      questions,
      onProgress: (...args) => {
        onProgress(...args)
        abortAfterFirst()
      },
      signal: controller.signal,
    })

    expect(onProgress).toHaveBeenCalledWith(1, 9)
    expect(report.rows).toHaveLength(1)
  })
})
