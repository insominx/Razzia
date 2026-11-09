import { Howler } from "howler"

/**
 * "Speakers without bass", as the plan's audit measured them: two cascaded
 * 250 Hz second-order high-passes (`highpass=f=250,highpass=f=250` in ffmpeg),
 * a fourth-order roll-off. Howler's master gain feeds `ctx.destination`; the
 * filters sit between the two, so every Howl on the page is heard through them.
 */
export const SMALL_SPEAKER_CUTOFF_HZ = 250

interface Graph {
  masterGain: AudioNode
  ctx: AudioContext
}

/** Returns the graph to put back to normal, or null when there is no Web Audio. */
export const insertSmallSpeakers = ({ masterGain, ctx }: Graph) => {
  const stages = [0, 1].map(() => {
    const filter = ctx.createBiquadFilter()

    filter.type = "highpass"
    filter.frequency.value = SMALL_SPEAKER_CUTOFF_HZ
    filter.Q.value = Math.SQRT1_2

    return filter
  })

  masterGain.disconnect()
  masterGain.connect(stages[0])
  stages[0].connect(stages[1])
  stages[1].connect(ctx.destination)

  return () => {
    masterGain.disconnect()
    for (const stage of stages) {
      stage.disconnect()
    }
    masterGain.connect(ctx.destination)
  }
}

/** Switches the page's whole sound through small speakers; returns the undo. */
export const routeHowlerThroughSmallSpeakers = (): (() => void) | null => {
  // `@types/howler` types these as always present, but Howler leaves them unset
  // when it fell back to HTML5 Audio.
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  const { ctx, masterGain } = Howler as Partial<typeof Howler>

  return ctx && masterGain ? insertSmallSpeakers({ ctx, masterGain }) : null
}
