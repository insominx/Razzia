import { SOUND_THEMES, type SoundTheme } from "@razzia/common/types/visuals"
import { Button, Toggle } from "@razzia/web/features/dev/director-ui"
import { routeHowlerThroughSmallSpeakers } from "@razzia/web/features/dev/small-speakers"
import { useSoundStore } from "@razzia/web/features/game/stores/sound"
import {
  SFX,
  sfxForTheme,
  sfxVolume,
} from "@razzia/web/features/game/utils/game-constants"
import { Howl } from "howler"
import { useEffect, useRef, useState } from "react"

interface Cue {
  id: string
  label: string
  /** Where the game plays it. */
  usedBy: string
  classic: string
  loop?: boolean
}

const CUES: readonly Cue[] = [
  {
    id: "show",
    label: "Question shown",
    usedBy: "Question",
    classic: SFX.SHOW_SOUND,
  },
  {
    id: "bed",
    label: "Answers bed",
    usedBy: "Answers, then Responses (loops)",
    classic: SFX.ANSWERS.MUSIC,
    loop: true,
  },
  {
    id: "pop",
    label: "Answer pop",
    usedBy: "Each answer in, and a player joining",
    classic: SFX.ANSWERS.SOUND,
  },
  {
    id: "tick",
    label: "Tick",
    usedBy: "Start countdown, last 5 s of answering",
    classic: SFX.BOUMP_SOUND,
  },
  {
    id: "results",
    label: "Results",
    usedBy: "Responses",
    classic: SFX.RESULTS_SOUND,
  },
  {
    id: "third",
    label: "Third place",
    usedBy: "Podium",
    classic: SFX.PODIUM.THREE,
  },
  {
    id: "second",
    label: "Second place",
    usedBy: "Podium",
    classic: SFX.PODIUM.SECOND,
  },
  {
    id: "roll",
    label: "Drum roll",
    usedBy: "Podium, before first",
    classic: SFX.PODIUM.SNEAR_ROOL,
  },
  {
    id: "first",
    label: "First place",
    usedBy: "Podium",
    classic: SFX.PODIUM.FIRST,
  },
]

const playLabel = (cue: Cue, playing: boolean): string => {
  if (playing) {
    return "Stop"
  }

  return cue.loop ? "Play loop" : "Play"
}

const decibels = (gain: number) => (20 * Math.log10(gain)).toFixed(1)

const THEME_LABEL: Record<SoundTheme, string> = {
  classic: "Classic",
  techno: "Techno",
  show: "Show (generated)",
}

/**
 * Every cue the game plays, at the gain the game plays it, through the same
 * master volume and mute. "Small speakers" runs the page's whole sound through
 * the plan's no-bass model, so a lost hit can be heard rather than read.
 */
const SoundTab = () => {
  const [theme, setTheme] = useState<SoundTheme>("classic")
  const [playing, setPlaying] = useState<ReadonlySet<string>>(new Set())
  const [seconds, setSeconds] = useState<Record<string, number>>({})
  const [small, setSmall] = useState(false)
  const [noWebAudio, setNoWebAudio] = useState(false)
  const howls = useRef(new Map<string, Howl>())
  const muted = useSoundStore((state) => state.muted)
  const volume = useSoundStore((state) => state.volume)

  const setPlayingFlag = (id: string, on: boolean) => {
    setPlaying((previous) => {
      const next = new Set(previous)

      if (on) {
        next.add(id)
      } else {
        next.delete(id)
      }

      return next
    })
  }

  const stopAll = () => {
    for (const howl of howls.current.values()) {
      howl.stop()
    }

    setPlaying(new Set())
  }

  const toggle = (cue: Cue) => {
    const src = sfxForTheme(theme, cue.classic)
    const key = `${theme}:${cue.id}`
    const existing = howls.current.get(key)

    if (existing?.playing()) {
      existing.stop()
      setPlayingFlag(key, false)

      return
    }

    const howl =
      existing ??
      new Howl({
        src: [src],
        volume: sfxVolume(src),
        loop: cue.loop ?? false,
        onload: () => {
          setSeconds((previous) => ({ ...previous, [key]: howl.duration() }))
        },
        onend: () => {
          if (!cue.loop) {
            setPlayingFlag(key, false)
          }
        },
        onstop: () => setPlayingFlag(key, false),
      })

    howls.current.set(key, howl)
    howl.play()
    setPlayingFlag(key, true)
  }

  // The filter chain belongs to the page's single Howler graph, so it is put
  // back whenever it is switched off or the tab goes away.
  const undo = useRef<(() => void) | null>(null)

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
    const { current } = howls

    return () => {
      for (const howl of current.values()) {
        howl.unload()
      }

      current.clear()
    }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <Toggle
          label="Pack"
          value={theme}
          onChange={(next) => {
            stopAll()
            setTheme(next)
          }}
          options={SOUND_THEMES.map((value) => ({
            label: THEME_LABEL[value],
            value,
          }))}
        />
        <Button active={small} onClick={() => setSmall((on) => !on)}>
          Small speakers
        </Button>
        <Button onClick={stopAll} disabled={playing.size === 0}>
          Stop all
        </Button>
      </div>

      {(muted || volume === 0) && (
        <p role="status" className="text-warning text-sm">
          The page is muted or at zero volume. Use the speaker button at the top
          right.
        </p>
      )}
      {small && noWebAudio && (
        <p role="alert" className="text-danger text-sm">
          This browser fell back to HTML5 audio, so the small-speaker filter
          cannot be inserted.
        </p>
      )}

      <table className="w-full max-w-4xl text-left text-sm">
        <thead className="text-text-muted text-xs tracking-widest uppercase">
          <tr>
            <th className="pr-4 pb-2">Cue</th>
            <th className="pr-4 pb-2">Played in</th>
            <th className="pr-4 pb-2">Gain</th>
            <th className="pr-4 pb-2">Length</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {CUES.map((cue) => {
            const src = sfxForTheme(theme, cue.classic)
            const key = `${theme}:${cue.id}`
            const gain = sfxVolume(src)
            const on = playing.has(key)

            return (
              <tr key={cue.id} className="border-border border-t">
                <td className="py-2 pr-4">
                  <p className="font-semibold">{cue.label}</p>
                  <p className="text-text-faint font-mono text-xs">{src}</p>
                </td>
                <td className="text-text-muted py-2 pr-4">{cue.usedBy}</td>
                <td className="py-2 pr-4 font-mono">
                  {`${gain.toFixed(2)} (${decibels(gain)} dB)`}
                </td>
                <td className="py-2 pr-4 font-mono">
                  {seconds[key] ? `${seconds[key].toFixed(1)} s` : "–"}
                </td>
                <td className="py-2">
                  <Button active={on} onClick={() => toggle(cue)}>
                    {playLabel(cue, on)}
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="text-text-faint text-xs">
        Gain is what the game passes to Howler for each cue; the master volume
        and mute multiply it. The plan&rsquo;s score will replace these cues, so
        this is the baseline it is measured against.
      </p>
    </div>
  )
}

export default SoundTab
