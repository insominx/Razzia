import { FIT_SIZES, type FitSize } from "@razzia/web/features/dev/fit"
import {
  FIXTURES,
  type FixtureId,
  QUIZZES,
} from "@razzia/web/features/dev/fixtures"
import type { RoomModeId } from "@razzia/web/features/dev/room-wash"
import type { ShowIntensity } from "@razzia/common/types/visuals"
import type { Surface, SurfaceDialect } from "@razzia/web/hooks/use-surface"

export interface DirectorState {
  dialect: SurfaceDialect
  surface: Surface
  room: RoomModeId
  /** How big the show is: the Visuals tab's setting, for every frame. */
  intensity: ShowIntensity
  quizId: string
  /** 0-based. */
  question: number
  /** The States tab: which screen, at which size (the size decides host or phone). */
  fixture: FixtureId
  sizeId: string
}

export const initialDirectorState = (): DirectorState => ({
  dialect: "dark-everywhere",
  surface: "stage",
  room: "off",
  intensity: "full",
  quizId: QUIZZES.at(0)?.id ?? "",
  question: 0,
  fixture: "answers",
  sizeId: FIT_SIZES[0].id,
})

export const sizeOf = (sizeId: string): FitSize =>
  FIT_SIZES.find((size) => size.id === sizeId) ?? FIT_SIZES[0]

const existsOn = (fixture: FixtureId, view: FitSize["view"]): boolean =>
  FIXTURES.some(
    (candidate) =>
      candidate.id === fixture &&
      (candidate.views as readonly string[]).includes(view),
  )

/** A screen only exists on some surfaces, so choosing one may move the frame. */
export const pickFixture = (
  state: DirectorState,
  fixture: FixtureId,
): DirectorState => {
  if (existsOn(fixture, sizeOf(state.sizeId).view)) {
    return { ...state, fixture }
  }

  const size = FIT_SIZES.find((candidate) => existsOn(fixture, candidate.view))

  return { ...state, fixture, sizeId: size?.id ?? state.sizeId }
}

/** A different surface may not have the current screen; fall back to Answers. */
export const pickSize = (
  state: DirectorState,
  sizeId: string,
): DirectorState => {
  const next = { ...state, sizeId }

  return existsOn(state.fixture, sizeOf(sizeId).view)
    ? next
    : { ...next, fixture: "answers" }
}

/** Changing quiz starts again at its first question. */
export const pickQuiz = (
  state: DirectorState,
  quizId: string,
): DirectorState => ({
  ...state,
  quizId,
  question: 0,
})
