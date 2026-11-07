import { Button } from "@razzia/web/features/dev/director-ui"
import { FIT_SIZES } from "@razzia/web/features/dev/fit"
import FrameView, { frameUrl } from "@razzia/web/features/dev/FrameView"
import { FIXTURES, type FixtureId } from "@razzia/web/features/dev/fixtures"
import { type DirectorState, sizeOf } from "@razzia/web/features/dev/settings"

interface Props {
  state: DirectorState
  onFixture: (fixture: FixtureId) => void
  onSize: (sizeId: string) => void
}

/**
 * Any screen, as the room or the phone would see it, at the size it is played
 * on, built from a real question. The frame keeps running between choices.
 */
const StatesTab = ({ state, onFixture, onSize }: Props) => {
  const size = sizeOf(state.sizeId)
  const ref = {
    fixture: state.fixture,
    quizId: state.quizId,
    question: state.question,
  }

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-2" aria-label="Screens">
        {FIXTURES.map((fixture) => (
          <Button
            key={fixture.id}
            active={state.fixture === fixture.id}
            onClick={() => onFixture(fixture.id)}
          >
            {fixture.label}
          </Button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-text-muted text-xs font-bold tracking-widest uppercase">
          Size
        </span>
        {FIT_SIZES.map((candidate) => (
          <Button
            key={candidate.id}
            active={state.sizeId === candidate.id}
            onClick={() => onSize(candidate.id)}
          >
            {`${candidate.view === "host" ? "Projector" : "Phone"} ${candidate.label}`}
          </Button>
        ))}
        <a
          className="text-info ml-auto text-sm font-semibold underline"
          href={frameUrl({
            view: size.view,
            fixture: ref,
            dialect: state.dialect,
            surface: state.surface,
            intensity: state.intensity,
          })}
          target="_blank"
          rel="noreferrer"
        >
          Open frame in a tab
        </a>
      </div>

      <FrameView
        view={size.view}
        size={size}
        fixture={ref}
        follow
        dialect={state.dialect}
        surface={state.surface}
        intensity={state.intensity}
        room={state.room}
        className={size.view === "phone" ? "max-w-sm" : undefined}
      />
    </div>
  )
}

export default StatesTab
