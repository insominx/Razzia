import { Select, Toggle } from "@razzia/web/features/dev/director-ui"
import FitTab, { type InspectTarget } from "@razzia/web/features/dev/FitTab"
import type { FitReport } from "@razzia/web/features/dev/fit"
import { findQuiz, QUIZZES } from "@razzia/web/features/dev/fixtures"
import RoundTab from "@razzia/web/features/dev/RoundTab"
import {
  ROOM_MODES,
  roomFilterId,
  roomFilterTransfer,
} from "@razzia/web/features/dev/room-wash"
import {
  type DirectorState,
  initialDirectorState,
  pickFixture,
  pickQuiz,
  pickSize,
} from "@razzia/web/features/dev/settings"
import ScoreBoard from "@razzia/web/features/dev/ScoreBoard"
import SoundTab from "@razzia/web/features/dev/SoundTab"
import StatesTab from "@razzia/web/features/dev/StatesTab"
import VolumeControl from "@razzia/web/features/game/components/VolumeControl"
import { useSurfaceOverride } from "@razzia/web/hooks/use-surface"
import clsx from "clsx"
import { useState } from "react"

const TABS = [
  { id: "states", label: "States" },
  { id: "round", label: "Round" },
  { id: "fit", label: "Fit report" },
  { id: "sound", label: "Sound" },
] as const

type TabId = (typeof TABS)[number]["id"]

const truncate = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text

/**
 * The lit-room model as SVG filters. They run in linear light, which is the
 * space the model is defined in, so a frame filtered here is the frame `wash.py`
 * would produce.
 */
const RoomWashDefs = () => (
  <svg
    width="0"
    height="0"
    className="absolute"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      {ROOM_MODES.flatMap((mode) => (mode.contrast ? [mode.contrast] : [])).map(
        (contrast) => {
          const { slope, intercept } = roomFilterTransfer(contrast)

          return (
            <filter
              key={contrast}
              id={roomFilterId(contrast)}
              colorInterpolationFilters="linearRGB"
            >
              <feComponentTransfer>
                {(["R", "G", "B"] as const).map((channel) => {
                  const Func = `feFunc${channel}` as const

                  return (
                    <Func
                      key={channel}
                      type="linear"
                      slope={slope}
                      intercept={intercept}
                    />
                  )
                })}
              </feComponentTransfer>
            </filter>
          )
        },
      )}
    </defs>
  </svg>
)

/**
 * The Director: every screen of a game at the size it is played on, built from
 * the real quizzes. Dev only; the route is compiled out of production builds.
 */
const Gallery = () => {
  const [state, setState] = useState<DirectorState>(initialDirectorState)
  const [tab, setTab] = useState<TabId>("states")
  const [report, setReport] = useState<FitReport | null>(null)
  const quiz = findQuiz(state.quizId)?.quiz

  useSurfaceOverride({ dialect: state.dialect, surface: state.surface })

  const inspect = (target: InspectTarget) => {
    setState((previous) =>
      pickSize(
        pickFixture(
          {
            ...previous,
            quizId: target.quizId,
            question: target.question,
          },
          target.fixture,
        ),
        target.sizeId,
      ),
    )
    setTab("states")
  }

  return (
    <main className="bg-canvas text-text-body min-h-dvh transition-colors duration-300">
      <RoomWashDefs />
      <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-6 px-5 py-8 md:px-8">
        <header className="border-border flex flex-col gap-4 border-b pb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-text-primary text-3xl font-semibold tracking-tight md:text-4xl">
                Director
              </h1>
              <p className="text-text-muted mt-2 text-sm">
                Real questions, on real screens, at the size they are played.
                Role tables live in <code className="font-mono">STYLE.md</code>.
              </p>
            </div>
            <VolumeControl />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:gap-6">
            <Select
              label="Quiz"
              value={state.quizId}
              onChange={(event) =>
                setState((previous) => pickQuiz(previous, event.target.value))
              }
            >
              {QUIZZES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {`${entry.quiz.subject} (${entry.quiz.questions.length})`}
                </option>
              ))}
            </Select>
            <Select
              label="Question"
              className="max-w-lg"
              value={state.question}
              onChange={(event) =>
                setState((previous) => ({
                  ...previous,
                  question: Number(event.target.value),
                }))
              }
            >
              {quiz?.questions.map((question, index) => (
                <option key={index} value={index}>
                  {`#${index + 1} ${truncate(question.question, 72)}`}
                </option>
              ))}
            </Select>
            <Toggle
              label="Room"
              value={state.room}
              onChange={(room) =>
                setState((previous) => ({ ...previous, room }))
              }
              options={ROOM_MODES.map((mode) => ({
                label: mode.label,
                value: mode.id,
              }))}
            />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
            <Toggle
              label="Intensity"
              value={state.intensity}
              onChange={(intensity) =>
                setState((previous) => ({ ...previous, intensity }))
              }
              options={[
                { label: "Full", value: "full" },
                { label: "Calm", value: "calm" },
                { label: "Silent", value: "silent" },
              ]}
            />
            <Toggle
              label="Dialect"
              value={state.dialect}
              onChange={(dialect) =>
                setState((previous) => ({ ...previous, dialect }))
              }
              options={[
                { label: "Dark everywhere", value: "dark-everywhere" },
                { label: "Stage & studio", value: "stage-studio" },
              ]}
            />
            <Toggle
              label="Surface"
              value={state.surface}
              onChange={(surface) =>
                setState((previous) => ({ ...previous, surface }))
              }
              options={[
                { label: "Stage", value: "stage" },
                { label: "Studio", value: "studio" },
              ]}
            />
          </div>
        </header>

        <div role="tablist" aria-label="Director" className="flex gap-2">
          {TABS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={tab === candidate.id}
              className={clsx(
                "rounded-rz-sm border px-4 py-2 text-sm font-semibold transition",
                tab === candidate.id
                  ? "border-info-border bg-info-tint text-info"
                  : "border-border bg-panel text-text-muted hover:text-text-primary",
              )}
              onClick={() => setTab(candidate.id)}
            >
              {candidate.label}
            </button>
          ))}
        </div>

        <section role="tabpanel" aria-label={tab}>
          {tab === "states" && (
            <StatesTab
              state={state}
              onFixture={(fixture) =>
                setState((previous) => pickFixture(previous, fixture))
              }
              onSize={(sizeId) =>
                setState((previous) => pickSize(previous, sizeId))
              }
            />
          )}
          {tab === "round" && (
            <RoundTab
              state={state}
              onQuestion={(question) =>
                setState((previous) => ({ ...previous, question }))
              }
            />
          )}
          {tab === "fit" && (
            <FitTab report={report} onReport={setReport} onInspect={inspect} />
          )}
          {tab === "sound" && (
            <div className="flex flex-col gap-10">
              <SoundTab />
              <ScoreBoard />
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default Gallery
