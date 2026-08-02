import { STATUS, type StatusDataMap } from "@razzia/common/types/game/status"
import Atmosphere from "@razzia/web/components/Atmosphere"
import NotFound from "@razzia/web/components/NotFound"
import Answers from "@razzia/web/features/game/components/states/Answers"
import Leaderboard from "@razzia/web/features/game/components/states/Leaderboard"
import PlayerFinished from "@razzia/web/features/game/components/states/PlayerFinished"
import Podium from "@razzia/web/features/game/components/states/Podium"
import Prepared from "@razzia/web/features/game/components/states/Prepared"
import Question from "@razzia/web/features/game/components/states/Question"
import Responses from "@razzia/web/features/game/components/states/Responses"
import Result from "@razzia/web/features/game/components/states/Result"
import Room from "@razzia/web/features/game/components/states/Room"
import Start from "@razzia/web/features/game/components/states/Start"
import Wait from "@razzia/web/features/game/components/states/Wait"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import {
  type Surface,
  type SurfaceDialect,
  useSurfaceOverride,
} from "@razzia/web/hooks/use-surface"
import { createFileRoute } from "@tanstack/react-router"
import clsx from "clsx"
import { useEffect, useState } from "react"

const PLAYERS = [
  {
    id: "gallery-ada",
    clientId: "gallery-client-ada",
    connected: true,
    username: "Ada",
    points: 9_640,
    streak: 4,
  },
  {
    id: "gallery-grace",
    clientId: "gallery-client-grace",
    connected: true,
    username: "Grace",
    points: 8_920,
    streak: 2,
  },
  {
    id: "gallery-linus",
    clientId: "gallery-client-linus",
    connected: true,
    username: "Linus",
    points: 7_880,
    streak: 1,
  },
] as const

const STATUS_FIXTURES = {
  [STATUS.SHOW_ROOM]: {
    text: "game:waitingForPlayers",
    inviteCode: "426 426",
  },
  [STATUS.SHOW_START]: {
    time: 3,
    subject: "Systems thinking",
  },
  [STATUS.SHOW_PREPARED]: {
    totalAnswers: 4,
    questionNumber: 7,
  },
  [STATUS.SHOW_QUESTION]: {
    question: "Which boundary owns the persisted state?",
    cooldown: 5,
  },
  [STATUS.SELECT_ANSWER]: {
    question: "Which boundary owns the persisted state?",
    answers: [
      "The configuration service",
      "The active browser tab",
      "The rendered component",
      "The current socket callback",
    ],
    time: 20,
    totalPlayer: 18,
  },
  [STATUS.SHOW_RESULT]: {
    correct: true,
    message: "game:correct",
    points: 840,
    myPoints: 9_640,
    rank: 1,
    aheadOfMe: null,
  },
  [STATUS.SHOW_RESPONSES]: {
    question: "Which boundary owns the persisted state?",
    responses: { 0: 12, 1: 2, 2: 3, 3: 1 },
    solutions: [0],
    answers: [
      "The configuration service",
      "The active browser tab",
      "The rendered component",
      "The current socket callback",
    ],
  },
  [STATUS.SHOW_LEADERBOARD]: {
    oldLeaderboard: PLAYERS.map((player, index) => ({
      ...player,
      points: player.points - (index + 1) * 240,
    })),
    leaderboard: [...PLAYERS],
  },
  [STATUS.FINISHED]: {
    subject: "Systems thinking",
    top: [...PLAYERS],
    rank: 1,
  },
  [STATUS.WAIT]: {
    text: "game:waitingForAnswers",
  },
} satisfies StatusDataMap

const STATE_PREVIEWS = [
  {
    id: "manager-room",
    label: "Manager · Room",
    render: () => <Room data={STATUS_FIXTURES[STATUS.SHOW_ROOM]} />,
  },
  {
    id: "show-start",
    label: "Start",
    render: () => <Start data={STATUS_FIXTURES[STATUS.SHOW_START]} />,
  },
  {
    id: "show-prepared",
    label: "Prepared",
    render: () => <Prepared data={STATUS_FIXTURES[STATUS.SHOW_PREPARED]} />,
  },
  {
    id: "show-question",
    label: "Question",
    render: () => <Question data={STATUS_FIXTURES[STATUS.SHOW_QUESTION]} />,
  },
  {
    id: "select-answer",
    label: "Answers",
    render: () => <Answers data={STATUS_FIXTURES[STATUS.SELECT_ANSWER]} />,
  },
  {
    id: "show-result",
    label: "Result",
    render: () => <Result data={STATUS_FIXTURES[STATUS.SHOW_RESULT]} />,
  },
  {
    id: "show-responses",
    label: "Responses",
    render: () => <Responses data={STATUS_FIXTURES[STATUS.SHOW_RESPONSES]} />,
  },
  {
    id: "show-leaderboard",
    label: "Leaderboard",
    render: () => (
      <Leaderboard data={STATUS_FIXTURES[STATUS.SHOW_LEADERBOARD]} />
    ),
  },
  {
    id: "manager-finished",
    label: "Manager · Podium",
    render: () => <Podium data={STATUS_FIXTURES[STATUS.FINISHED]} />,
  },
  {
    id: "player-finished",
    label: "Player · Finished",
    render: () => <PlayerFinished data={STATUS_FIXTURES[STATUS.FINISHED]} />,
  },
  {
    id: "wait",
    label: "Wait",
    render: () => <Wait data={STATUS_FIXTURES[STATUS.WAIT]} />,
  },
] as const

const Toggle = <T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: ReadonlyArray<{ label: string; value: T }>
  value: T
  onChange: (value: T) => void
}) => (
  <fieldset className="flex flex-wrap items-center gap-2">
    <legend className="text-text-muted mr-2 text-xs font-bold tracking-widest uppercase">
      {label}
    </legend>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={value === option.value}
        className={clsx(
          "rounded-rz-sm border px-3 py-2 text-sm font-semibold transition",
          value === option.value
            ? "border-brand-border bg-brand-tint text-brand"
            : "border-border bg-panel text-text-muted hover:text-text-primary",
        )}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </fieldset>
)

const Gallery = () => {
  const [dialect, setDialect] = useState<SurfaceDialect>("dark-everywhere")
  const [surface, setSurface] = useState<Surface>("stage")
  const [selectedIndex, setSelectedIndex] = useState(1)
  const setPlayers = useManagerStore((state) => state.setPlayers)
  const resetManager = useManagerStore((state) => state.reset)
  const setPlayer = usePlayerStore((state) => state.setPlayer)
  const resetPlayer = usePlayerStore((state) => state.reset)
  const currentState = STATE_PREVIEWS[selectedIndex]

  useSurfaceOverride({ dialect, surface })

  useEffect(() => {
    setPlayers([...PLAYERS])
    setPlayer({ username: "Ada", points: 9_640 })

    return () => {
      resetManager()
      resetPlayer()
    }
  }, [resetManager, resetPlayer, setPlayer, setPlayers])

  return (
    <main className="bg-canvas text-text-body min-h-dvh transition-colors duration-300">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 md:px-8">
        <header className="border-border flex flex-col gap-4 border-b pb-6">
          <div>
            <h1 className="text-text-primary text-3xl font-semibold tracking-tight md:text-4xl">
              State gallery
            </h1>
            <p className="text-text-muted mt-2 text-sm">
              Deterministic fixtures for live game states. Role tables live in{" "}
              <code className="font-mono">STYLE.md</code>.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Toggle
              label="Dialect"
              value={dialect}
              onChange={setDialect}
              options={[
                { label: "Dark everywhere", value: "dark-everywhere" },
                { label: "Stage & studio", value: "stage-studio" },
              ]}
            />
            <Toggle
              label="Surface"
              value={surface}
              onChange={setSurface}
              options={[
                { label: "Stage", value: "stage" },
                { label: "Studio", value: "studio" },
              ]}
            />
          </div>
        </header>

        <nav className="flex flex-wrap gap-2" aria-label="Gallery states">
          {STATE_PREVIEWS.map((state, index) => (
            <button
              key={state.id}
              type="button"
              aria-pressed={selectedIndex === index}
              className={clsx(
                "rounded-rz-sm border px-3 py-2 text-sm font-semibold transition",
                selectedIndex === index
                  ? "border-info-border bg-info-tint text-info"
                  : "border-border bg-panel text-text-muted hover:text-text-primary",
              )}
              onClick={() => setSelectedIndex(index)}
            >
              {state.label}
            </button>
          ))}
        </nav>

        <article className="rounded-rz-xl border-border bg-canvas overflow-hidden border">
          <header className="border-border bg-panel flex items-center justify-between border-b px-4 py-3">
            <p className="text-text-primary text-sm font-semibold">
              {currentState.label}
            </p>
            <p className="text-text-muted text-xs tracking-wider uppercase">
              fixture
            </p>
          </header>
          <div className="bg-canvas relative flex min-h-[680px] flex-col overflow-hidden p-4">
            <Atmosphere recipe="photo" />
            <div className="relative z-10 flex min-h-0 flex-1 flex-col">
              {currentState.render()}
            </div>
          </div>
        </article>
      </div>
    </main>
  )
}

const GalleryPage = () => (import.meta.env.DEV ? <Gallery /> : <NotFound />)

export const Route = createFileRoute("/dev/gallery")({
  component: GalleryPage,
})
