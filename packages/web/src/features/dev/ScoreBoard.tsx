import { getAnswerRevealDuration } from "@razzia/common/utils/answer-reveal"
import { SOUND_THEMES, type SoundTheme } from "@razzia/common/types/visuals"
import { Button, Select, Toggle } from "@razzia/web/features/dev/director-ui"
import { routeHowlerThroughSmallSpeakers } from "@razzia/web/features/dev/small-speakers"
import {
  type Cue,
  type Intensity,
  type Lane,
  type SceneSpec,
  score,
  type Surface,
} from "@razzia/web/features/game/audio"
// Side effect: installs `window.__renderScore` for the loudness gate.
import "@razzia/web/features/game/audio/dev-hook"
import { useSoundStore } from "@razzia/web/features/game/stores/sound"
import { Howler } from "howler"
import { useEffect, useRef, useState } from "react"

/** What a row needs to place its stamps: "now", and how far into the scene to start. */
interface Play {
  now: number
  offsetMs: number
  answers: number
  time: number
}

interface Row {
  id: string
  label: string
  detail: string
  /** The plan's target level for the moment, if it has one. */
  target?: string
  /** The lane a Stop button silences; none for one-shot cues. */
  lane?: Lane
  run: (play: Play) => void
}

const VOTES = [3, 8, 4, 2]

/** A stamp `ms` after the scene's own start, shifted back by how late we join. */
const at = (play: Play, ms: number): number => play.now + ms - play.offsetMs

const start = (spec: SceneSpec, play: Play, stamped = true): void => {
  score.start(spec, stamped ? undefined : { offsetMs: play.offsetMs })
}

const strike =
  (outcome: "right" | "wrong" | "none") =>
  (play: Play): void => {
    start(
      {
        scene: "strike",
        resultsAt: at(play, 0),
        serverNow: play.now,
        outcome,
      },
      play,
    )
  }

const verdict =
  (outcome: "right" | "wrong") =>
  (play: Play): void => {
    start(
      {
        scene: "verdict",
        resultsAt: at(play, 0),
        serverNow: play.now,
        votes: VOTES,
        outcome,
      },
      play,
    )
  }

const cue = (value: Cue) => (): void => {
  score.cue(value)
}

const counters = { join: 0, pop: 0, tick: 0 }

const SCENES: readonly Row[] = [
  {
    id: "lobby",
    label: "Lobby bed",
    detail:
      "A low bed that loops until it is replaced. Joins add a climbing note.",
    lane: "bed",
    run: (play) => {
      start({ scene: "lobby" }, play, false)
    },
  },
  {
    id: "title",
    label: "Title",
    detail: "House lights drop: riser, impact, whoosh.",
    lane: "show",
    run: (play) => {
      start({ scene: "title" }, play, false)
    },
  },
  {
    id: "lamps",
    label: "Start lights",
    detail: "Three rising clunks, a second apart, then GO.",
    lane: "show",
    run: (play) => {
      start({ scene: "lamps" }, play, false)
    },
  },
  {
    id: "roundCard",
    label: "Round card",
    detail: "Whoosh and a note. The last question adds a second note.",
    lane: "show",
    run: (play) => {
      start({ scene: "roundCard" }, play, false)
    },
  },
  {
    id: "reading",
    label: "Reading, then charge",
    detail: "Near silence for 6 s, then a 5 s charge that swells.",
    target: "Reading -32.6 LUFS",
    lane: "bed",
    run: (play) => {
      start(
        {
          scene: "reading",
          chargeAt: at(play, 6000),
          chargeMs: 5000,
          serverNow: play.now,
        },
        play,
      )
    },
  },
  {
    id: "answers",
    label: "Power-on, unlock, answering, last 5 s",
    detail:
      "One quiet layer per answer at its slot, the drop on unlock, the groove, then ticks climbing to TIME.",
    target: "Power-on -25.7 then -22.7, unlock -11.9, answering -14.3",
    lane: "bed",
    run: (play) => {
      start(
        {
          scene: "answers",
          revealStartedAt: at(play, 0),
          unlockAt: at(play, getAnswerRevealDuration(play.answers)),
          serverNow: play.now,
          answers: play.answers,
          time: play.time,
        },
        play,
      )
    },
  },
  {
    id: "time",
    label: "TIME",
    detail: "The hit that ends answering, and cuts the groove.",
    target: "TIME -12.2 LUFS",
    lane: "verdict",
    run: (play) => {
      start(
        { scene: "time", resultsAt: at(play, 0), serverNow: play.now },
        play,
      )
    },
  },
  {
    id: "count",
    label: "The count",
    detail: "Rising ticks, smallest bar first (votes 3, 8, 4, 2).",
    lane: "verdict",
    run: (play) => {
      start(
        {
          scene: "count",
          resultsAt: at(play, 0),
          serverNow: play.now,
          votes: VOTES,
        },
        play,
      )
    },
  },
  {
    id: "spotlight",
    label: "The spotlight",
    detail: "Heartbeat and a low swell: does the light stay?",
    lane: "verdict",
    run: (play) => {
      start(
        { scene: "spotlight", resultsAt: at(play, 0), serverNow: play.now },
        play,
      )
    },
  },
  {
    id: "strike-right",
    label: "Strike: crowd was right",
    detail: "Major chord and hit, decaying in about 6 s so you can talk.",
    target: "Verdict -7.7 LUFS",
    lane: "verdict",
    run: strike("right"),
  },
  {
    id: "strike-wrong",
    label: "Strike: crowd was wrong",
    detail: "Minor chord and hit: the light jumped to the right answer.",
    target: "Verdict -7.7 LUFS",
    lane: "verdict",
    run: strike("wrong"),
  },
  {
    id: "strike-none",
    label: "Strike: nobody answered",
    detail: "A quiet reveal, no crash.",
    lane: "verdict",
    run: strike("none"),
  },
  {
    id: "verdict-right",
    label: "Whole verdict (crowd right)",
    detail: "TIME at 0, count at 0.9 s, spotlight at 2.0 s, strike at 3.0 s.",
    lane: "verdict",
    run: verdict("right"),
  },
  {
    id: "verdict-wrong",
    label: "Whole verdict (crowd wrong)",
    detail: "The same beats with the minor strike.",
    lane: "verdict",
    run: verdict("wrong"),
  },
  {
    id: "leaderboard",
    label: "Leaderboard groove",
    detail:
      "Whooshes for the bars, then at 3 s the groove kicks in and the board reorders.",
    lane: "bed",
    run: (play) => {
      start({ scene: "leaderboard", rows: 5, overtakes: true }, play, false)
    },
  },
  {
    id: "podium",
    label: "Podium (three places)",
    detail: "Third, second, a real roll, first, then the finale groove.",
    target: "1st place -6.6 LUFS",
    lane: "show",
    run: (play) => {
      start({ scene: "podium", places: 3 }, play, false)
    },
  },
  {
    id: "podium-one",
    label: "Podium (one player)",
    detail: "No third or second: the roll starts at once.",
    lane: "show",
    run: (play) => {
      start({ scene: "podium", places: 1 }, play, false)
    },
  },
]

const CUES: readonly Row[] = [
  {
    id: "join",
    label: "Player joins",
    detail: "A flip and a note one step higher each time.",
    run: () => {
      score.cue({ cue: "join", index: counters.join })
      counters.join += 1
    },
  },
  {
    id: "pop",
    label: "Answer in",
    detail: "A rising note per answer.",
    run: () => {
      score.cue({ cue: "pop", index: counters.pop })
      counters.pop += 1
    },
  },
  {
    id: "tick",
    label: "Countdown tick",
    detail: "Steps up the scale 81, 84, 86, 88, 93.",
    run: () => {
      score.cue({ cue: "tick", index: counters.tick % 5 })
      counters.tick += 1
    },
  },
  { id: "lamp1", label: "Lamp 1", detail: "", run: cue({ cue: "lamp", k: 0 }) },
  { id: "lamp2", label: "Lamp 2", detail: "", run: cue({ cue: "lamp", k: 1 }) },
  { id: "lamp3", label: "Lamp 3", detail: "", run: cue({ cue: "lamp", k: 2 }) },
  {
    id: "go",
    label: "GO",
    detail: "Impact and stab.",
    run: cue({ cue: "go" }),
  },
  { id: "whoosh", label: "Whoosh", detail: "", run: cue({ cue: "whoosh" }) },
  { id: "impact", label: "Impact", detail: "", run: cue({ cue: "impact" }) },
  {
    id: "third",
    label: "Third place",
    detail: "",
    run: cue({ cue: "place", place: 3 }),
  },
  {
    id: "second",
    label: "Second place",
    detail: "",
    run: cue({ cue: "place", place: 2 }),
  },
  {
    id: "first",
    label: "First place",
    detail: "",
    target: "1st place -6.6 LUFS",
    run: cue({ cue: "place", place: 1 }),
  },
  {
    id: "roll",
    label: "Drum roll (4 s)",
    detail: "",
    run: cue({ cue: "roll", ms: 4000 }),
  },
]

const INTENSITIES: ReadonlyArray<{ label: string; value: Intensity }> = [
  { label: "Full", value: "full" },
  { label: "Calm", value: "calm" },
  { label: "Silent", value: "silent" },
]

const SURFACES: ReadonlyArray<{ label: string; value: Surface }> = [
  { label: "Host", value: "host" },
  { label: "Phone", value: "player" },
]

const PACK_LABEL: Record<SoundTheme, string> = {
  classic: "Classic",
  techno: "Techno",
  show: "Show score",
}

const TOTALS = [3, 4, 5, 6, 7, 8, 10, 12]

const OFFSETS = [0, 1, 3, 5, 10, 13]

// `@types/howler` types `ctx` as always present; it is null when Howler fell
// back to HTML5 audio.
const hasWebAudio = (): boolean =>
  Boolean((Howler as Partial<typeof Howler>).ctx)

/**
 * Every scene and cue of the score, at the level the game plays it, through the
 * same master volume and mute. Pick a round to hear the climb; pick an offset to
 * hear a scene join late (events already past are skipped, never replayed).
 * "Small speakers" runs the page through the plan's no-bass model.
 */
const ScoreBoard = () => {
  const [intensity, setIntensity] = useState<Intensity>("full")
  const [pack, setPack] = useState<SoundTheme>("show")
  const [surface, setSurface] = useState<Surface>("host")
  const [total, setTotal] = useState(6)
  const [round, setRound] = useState(1)
  const [answers, setAnswers] = useState(4)
  const [time, setTime] = useState(14)
  const [offset, setOffset] = useState(0)
  const [small, setSmall] = useState(false)
  const [noWebAudio, setNoWebAudio] = useState(false)
  const [live, setLive] = useState("")
  const muted = useSoundStore((state) => state.muted)
  const volume = useSoundStore((state) => state.volume)
  const undo = useRef<(() => void) | null>(null)

  useEffect(() => {
    score.configure({ intensity, theme: pack, surface })
  }, [intensity, pack, surface])

  useEffect(() => {
    score.setRound(round, total)
  }, [round, total])

  useEffect(() => {
    if (!small) {
      return
    }

    undo.current = routeHowlerThroughSmallSpeakers()
    setNoWebAudio(undo.current === null)

    return () => {
      undo.current?.()
      undo.current = null
    }
  }, [small])

  useEffect(() => {
    const timer = setInterval(() => {
      const state = score.debug()

      setLive(
        Object.entries(state.live)
          .map(([lane, key]) => `${lane}: ${key}`)
          .join("  |  "),
      )
    }, 250)

    return () => {
      clearInterval(timer)
      score.stop()
    }
  }, [])

  const run = (row: Row) => {
    useSoundStore.getState().unlock()
    row.run({ now: Date.now(), offsetMs: offset * 1000, answers, time })
  }

  const rows = (list: readonly Row[]) =>
    list.map((row) => (
      <tr key={row.id} className="border-border border-t">
        <td className="py-2 pr-4">
          <p className="font-semibold">{row.label}</p>
          {row.detail && (
            <p className="text-text-faint text-xs">{row.detail}</p>
          )}
        </td>
        <td className="text-text-muted py-2 pr-4 font-mono text-xs">
          {row.target ?? ""}
        </td>
        <td className="py-2">
          <div className="flex gap-2">
            <Button onClick={() => run(row)}>Play</Button>
            {row.lane && (
              <Button
                onClick={() => {
                  score.stop(row.lane, 0.3)
                }}
              >
                Stop
              </Button>
            )}
          </div>
        </td>
      </tr>
    ))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <Toggle
          label="Show intensity"
          value={intensity}
          onChange={setIntensity}
          options={INTENSITIES}
        />
        <Toggle
          label="Pack"
          value={pack}
          onChange={setPack}
          options={SOUND_THEMES.map((value) => ({
            label: PACK_LABEL[value],
            value,
          }))}
        />
        <Toggle
          label="Surface"
          value={surface}
          onChange={setSurface}
          options={SURFACES}
        />
        <Button active={small} onClick={() => setSmall((on) => !on)}>
          Small speakers
        </Button>
        <Button
          onClick={() => {
            score.stop()
          }}
        >
          Stop all
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Select
          label="Round"
          value={round}
          onChange={(event) => setRound(Number(event.target.value))}
        >
          {Array.from({ length: total }, (_, index) => index + 1).map(
            (value) => (
              <option key={value} value={value}>
                {`${value} of ${total}`}
              </option>
            ),
          )}
        </Select>
        <Select
          label="Quiz length"
          value={total}
          onChange={(event) => {
            const next = Number(event.target.value)

            setTotal(next)
            setRound((value) => Math.min(value, next))
          }}
        >
          {TOTALS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Select
          label="Answers"
          value={answers}
          onChange={(event) => setAnswers(Number(event.target.value))}
        >
          {[2, 3, 4].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Select
          label="Time to answer"
          value={time}
          onChange={(event) => setTime(Number(event.target.value))}
        >
          {[8, 14, 20, -1].map((value) => (
            <option key={value} value={value}>
              {value === -1 ? "No limit" : `${value} s`}
            </option>
          ))}
        </Select>
        <Select
          label="Join late by"
          value={offset}
          onChange={(event) => setOffset(Number(event.target.value))}
        >
          {OFFSETS.map((value) => (
            <option key={value} value={value}>
              {`${value} s`}
            </option>
          ))}
        </Select>
      </div>

      {(muted || volume === 0) && (
        <p role="status" className="text-warning text-sm">
          The page is muted or at zero volume, so the score schedules nothing.
          Use the speaker button at the top right.
        </p>
      )}
      {pack !== "show" && (
        <p role="status" className="text-text-muted text-sm">
          This pack plays the old mp3 files through the legacy adapter: no
          climb, no groove.
        </p>
      )}
      {small && noWebAudio && (
        <p role="alert" className="text-danger text-sm">
          This browser fell back to HTML5 audio, so the small-speaker filter
          cannot be inserted.
        </p>
      )}
      {!hasWebAudio() && pack === "show" && (
        <p role="alert" className="text-danger text-sm">
          Howler has no Web Audio context here, so the show score stays silent.
        </p>
      )}

      <table className="w-full max-w-5xl text-left text-sm">
        <thead className="text-text-muted text-xs tracking-widest uppercase">
          <tr>
            <th className="pr-4 pb-2">Scene</th>
            <th className="pr-4 pb-2">Target (max momentary, full volume)</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>{rows(SCENES)}</tbody>
      </table>

      <table className="w-full max-w-5xl text-left text-sm">
        <thead className="text-text-muted text-xs tracking-widest uppercase">
          <tr>
            <th className="pr-4 pb-2">Cue</th>
            <th className="pr-4 pb-2" />
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>{rows(CUES)}</tbody>
      </table>

      <p className="text-text-faint font-mono text-xs">
        {live ? `Live: ${live}` : "Nothing playing"}
      </p>
      <p className="text-text-faint text-xs">
        Scenes anchored to server stamps are started with stamps in the near
        future, as the screens will. The loudness gate (scripts/score-gate.mjs)
        renders the same scenes offline.
      </p>
    </div>
  )
}

export default ScoreBoard
