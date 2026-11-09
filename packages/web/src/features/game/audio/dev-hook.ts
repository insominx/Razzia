/**
 * Dev-only: exposes the offline renderer on `window` so the loudness gate
 * (`razzia-workflow/tasks/0008-show-redesign/scripts/score-gate.mjs`) can drive
 * a headless browser. `ScoreBoard` imports this for its side effect; the gate
 * also imports it directly, so it works whether or not the board is mounted.
 */
import type {
  Intensity,
  VerdictOutcome,
} from "@razzia/web/features/game/audio/scenes"
import {
  PROTOTYPE_T,
  referenceTimeline,
  renderTimeline,
  type TimelineEntry,
} from "@razzia/web/features/game/audio/offline"

export interface RenderRequest {
  /** `reference` renders the prototype-timed round; `entries` renders your own. */
  name: "reference" | "entries"
  entries?: TimelineEntry[]
  duration?: number
  intensity?: Intensity
  round?: number
  total?: number
  outcome?: VerdictOutcome
  votes?: number[]
  answers?: number
  time?: number
}

export interface RenderResult {
  samples: number
  rate: number
  seconds: number
}

declare global {
  interface Window {
    __renderScore?: (request: RenderRequest) => Promise<RenderResult>
    __scorePcmChunk?: (index: number, bytes?: number) => string
  }
}

const RATE = 44_100

const toBase64 = (bytes: Uint8Array): string => {
  let text = ""

  for (let i = 0; i < bytes.length; i += 8192) {
    text += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }

  return btoa(text)
}

export const installScoreRenderHook = (): void => {
  if (typeof window === "undefined" || window.__renderScore) {
    return
  }

  let pcm = new Int16Array(0)

  window.__renderScore = async (request) => {
    const entries =
      request.name === "entries"
        ? (request.entries ?? [])
        : referenceTimeline({
            outcome: request.outcome,
            votes: request.votes,
            answers: request.answers,
            time: request.time,
          })
    const seconds = request.duration ?? PROTOTYPE_T.end
    const buffer = await renderTimeline(entries, {
      duration: seconds,
      intensity: request.intensity,
      round: request.round,
      total: request.total,
      sampleRate: RATE,
    })
    const left = buffer.getChannelData(0)
    const right = buffer.getChannelData(1)

    pcm = new Int16Array(left.length * 2)

    for (let i = 0; i < left.length; i += 1) {
      pcm[i * 2] = Math.max(-1, Math.min(1, left[i])) * 32_767
      pcm[i * 2 + 1] = Math.max(-1, Math.min(1, right[i])) * 32_767
    }

    return { samples: pcm.length, rate: RATE, seconds }
  }

  window.__scorePcmChunk = (index, bytes = 2_000_000) => {
    const start = index * bytes
    const length = Math.max(0, Math.min(bytes, pcm.byteLength - start))

    return toBase64(new Uint8Array(pcm.buffer, start, length))
  }
}

installScoreRenderHook()
