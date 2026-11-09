import Frame, { type FrameMotion } from "@razzia/web/features/dev/Frame"
import type { FitView } from "@razzia/web/features/dev/fit"
import {
  findQuiz,
  isFixtureId,
  QUIZZES,
} from "@razzia/web/features/dev/fixtures"
import type { ShowIntensity } from "@razzia/common/types/visuals"
import type { Surface, SurfaceDialect } from "@razzia/web/hooks/use-surface"

interface Props {
  view: FitView
  fixture: string
  quiz: string
  q: number
  dialect: SurfaceDialect
  surface: Surface
  motion: FrameMotion
  intensity: ShowIntensity
}

/**
 * The `/dev/frame` search params, turned into a fixture. An unknown fixture or
 * quiz falls back rather than failing, so a hand-typed URL still shows
 * something.
 */
const FramePage = ({
  view,
  fixture,
  quiz,
  q,
  dialect,
  surface,
  motion,
  intensity,
}: Props) => {
  const entry = findQuiz(quiz)

  if (!entry) {
    return <p className="p-8">{`No quizzes found (${QUIZZES.length}).`}</p>
  }

  return (
    <Frame
      view={view}
      initial={{
        fixture: isFixtureId(fixture) ? fixture : "answers",
        quizId: entry.id,
        question: q,
      }}
      dialect={dialect}
      surface={surface}
      motion={motion}
      intensity={intensity}
    />
  )
}

export default FramePage
