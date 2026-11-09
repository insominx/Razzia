import type { DirectorApi } from "@razzia/web/features/dev/director-api"
import {
  evaluateFit,
  FIT_SCREENS,
  FIT_SIZES,
  SAFE_BOTTOM_SHARE,
  type FitReport,
  type FitRow,
  type FitScreen,
  type FitSize,
} from "@razzia/web/features/dev/fit"
import type { FixtureId, RealQuestion } from "@razzia/web/features/dev/fixtures"

/** The fixture that stands for each fit screen. */
export const FIT_FIXTURE: Record<FitScreen, FixtureId> = {
  question: "question",
  answers: "answers",
  responses: "responses",
  wait: "wait",
}

export interface FitFrame {
  size: FitSize
  api: Pick<DirectorApi, "showFixture" | "settle" | "measure">
}

const sizeOrder = (id: string) => FIT_SIZES.findIndex((size) => size.id === id)

const screenOrder = (row: FitRow) =>
  FIT_SCREENS[FIT_SIZES[sizeOrder(row.size)]?.view ?? "host"].indexOf(
    row.screen,
  )

/** Matrix order: size, then screen, then the quizzes as given. */
const byMatrix = (a: FitRow, b: FitRow) =>
  sizeOrder(a.size) - sizeOrder(b.size) ||
  screenOrder(a) - screenOrder(b) ||
  a.quiz.localeCompare(b.quiz) ||
  a.question - b.question

export const countFitChecks = (
  sizes: readonly FitSize[],
  questions: number,
): number =>
  sizes.reduce(
    (sum, size) => sum + FIT_SCREENS[size.view].length * questions,
    0,
  )

/**
 * Lays every real question out in every frame, one frame per size, and
 * measures it. Frames run side by side; within a frame the checks run in turn,
 * because a frame can show only one screen at a time.
 */
export const runFit = async ({
  frames,
  questions,
  onProgress,
  signal,
}: {
  frames: readonly FitFrame[]
  questions: readonly RealQuestion[]
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}): Promise<FitReport> => {
  const total = countFitChecks(
    frames.map((frame) => frame.size),
    questions.length,
  )
  const rows: FitRow[] = []

  await Promise.all(
    frames.map(async ({ size, api }) => {
      for (const { quizId, index } of questions) {
        for (const screen of FIT_SCREENS[size.view]) {
          if (signal?.aborted) {
            return
          }

          api.showFixture({
            fixture: FIT_FIXTURE[screen],
            quizId,
            question: index,
          })
          // A frame shows one screen at a time, so its checks cannot overlap.
          // oxlint-disable-next-line no-await-in-loop
          await api.settle()

          rows.push({
            quiz: quizId,
            question: index + 1,
            size: size.id,
            screen,
            result: evaluateFit(api.measure(), {
              safeBottomShare:
                size.view === "host" ? SAFE_BOTTOM_SHARE : undefined,
            }),
          })
          onProgress?.(rows.length, total)
        }
      }
    }),
  )

  return { generatedAt: new Date().toISOString(), rows: rows.sort(byMatrix) }
}
