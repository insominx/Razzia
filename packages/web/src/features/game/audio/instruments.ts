/**
 * The score's voices and mixing graph.
 *
 * This is a faithful port of the audio engine in
 * `razzia-workflow/tasks/0008-show-redesign/prototype/index.html`: the plan's
 * loudness targets were measured on exactly these instruments, so the DSP (the
 * oscillators, filter sweeps, envelopes and gains) is unchanged. Only the shape
 * changed: positional arguments became one options object per voice, and the
 * graph takes any `BaseAudioContext` so the same code renders offline.
 *
 * Nothing here knows about scenes, clocks or Howler.
 */

/** One sixteenth note at 120 BPM, in seconds. One second is two beats. */
export const S16 = 0.125

export const midiHz = (note: number): number => 440 * 2 ** ((note - 69) / 12)

const clamp = (x: number, lo = 0, hi = 1): number =>
  Math.min(hi, Math.max(lo, x))

export const mix = (a: number, b: number, p: number): number => a + (b - a) * p

/** The prototype's deterministic noise, so renders are repeatable. */
export const seed = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453

  return x - Math.floor(x)
}

export type BusName = "dry" | "duck" | "drum"

/**
 * What a voice needs to make sound. The shared `Graph` and every lane's
 * `LaneBus` have this shape, so a voice neither knows nor cares which it plays
 * into.
 */
export interface Bus {
  readonly ctx: BaseAudioContext
  readonly noise: AudioBuffer
  readonly dry: AudioNode
  /** The bed bus; a kick ducks it, so it needs `.gain`. */
  readonly duck: GainNode
  readonly drum: AudioNode
  readonly rev: AudioNode
  readonly dly: AudioNode
}

export interface Graph extends Bus {
  readonly master: GainNode
  /** The music bus the lanes' duck buses feed (`bed` in the prototype). */
  readonly bed: GainNode
}

const NOISE_SECONDS = 2
const IR_SECONDS = 2.6

const makeShaperCurve = (): Float32Array<ArrayBuffer> => {
  const curve = new Float32Array(2049)

  for (let i = 0; i < curve.length; i += 1) {
    const x = i / 1024 - 1

    curve[i] = Math.tanh(x * 1.15) / Math.tanh(1.15)
  }

  return curve
}

const makeImpulseResponse = (ctx: BaseAudioContext): AudioBuffer => {
  const { sampleRate } = ctx
  const length = Math.floor(sampleRate * IR_SECONDS)
  const ir = ctx.createBuffer(2, length, sampleRate)

  for (let channel = 0; channel < 2; channel += 1) {
    const data = ir.getChannelData(channel)
    let lowpassed = 0

    for (let i = 0; i < length; i += 1) {
      const envelope =
        (1 - i / length) ** 3.2 * Math.exp(-i / (sampleRate * 0.9))
      const white = seed(i * (channel + 1) * 0.77) * 2 - 1

      lowpassed += (white - lowpassed) * 0.55
      data[i] = lowpassed * envelope * (i < 400 ? i / 400 : 1)
    }
  }

  return ir
}

const makeNoise = (ctx: BaseAudioContext): AudioBuffer => {
  const buffer = ctx.createBuffer(
    1,
    ctx.sampleRate * NOISE_SECONDS,
    ctx.sampleRate,
  )
  const data = buffer.getChannelData(0)

  for (let i = 0; i < data.length; i += 1) {
    data[i] = seed(i * 0.913) * 2 - 1
  }

  return buffer
}

/**
 * The shared mix: voices -> dry bus -> compressor -> soft clip -> master, with
 * one reverb and one tempo-synced delay as sends. `destination` defaults to the
 * context's output; the live score passes `Howler.masterGain`.
 */
export const createGraph = (
  ctx: BaseAudioContext,
  destination: AudioNode = ctx.destination,
): Graph => {
  const master = ctx.createGain()

  master.gain.value = 0.86

  const comp = ctx.createDynamicsCompressor()

  comp.threshold.value = -15
  comp.knee.value = 10
  comp.ratio.value = 3.5
  comp.attack.value = 0.004
  comp.release.value = 0.13

  const shaper = ctx.createWaveShaper()

  shaper.curve = makeShaperCurve()
  shaper.oversample = "2x"

  const dry = ctx.createGain()

  dry.connect(comp)
  comp.connect(shaper)
  shaper.connect(master)
  master.connect(destination)

  const rev = ctx.createConvolver()

  rev.buffer = makeImpulseResponse(ctx)

  const revReturn = ctx.createGain()

  revReturn.gain.value = 0.5
  rev.connect(revReturn)
  revReturn.connect(comp)

  const dly = ctx.createDelay(1.5)

  dly.delayTime.value = 0.375

  const feedback = ctx.createGain()

  feedback.gain.value = 0.36

  const lowpass = ctx.createBiquadFilter()

  lowpass.type = "lowpass"
  lowpass.frequency.value = 2800

  const highpass = ctx.createBiquadFilter()

  highpass.type = "highpass"
  highpass.frequency.value = 320
  dly.connect(lowpass)
  lowpass.connect(highpass)
  highpass.connect(feedback)
  feedback.connect(dly)

  const delayReturn = ctx.createGain()

  delayReturn.gain.value = 0.42
  highpass.connect(delayReturn)
  delayReturn.connect(comp)
  delayReturn.connect(rev)

  const bed = ctx.createGain()

  bed.gain.value = 0.74
  bed.connect(dry)

  const duck = ctx.createGain()

  duck.connect(bed)

  const drum = ctx.createGain()

  drum.gain.value = 0.72
  drum.connect(dry)

  return { ctx, master, noise: makeNoise(ctx), dry, rev, dly, bed, duck, drum }
}

export interface LaneBus extends Bus {
  /** Ramps every send of this bus to silence, starting at `at`. */
  fade: (at: number, seconds: number) => void
  /** Takes the bus out of the graph. */
  dispose: () => void
}

/**
 * A private set of sends in front of the shared graph, so one scene can be
 * faded, cut or trimmed without touching another. At unity it is transparent:
 * the gain staging matches the prototype's single graph exactly.
 */
export const createLaneBus = (graph: Graph, levelDb: number): LaneBus => {
  const { ctx } = graph
  const trim = 10 ** (levelDb / 20)
  const levels: GainNode[] = []
  const stage = (target: AudioNode): GainNode => {
    const node = ctx.createGain()

    node.gain.value = trim
    node.connect(target)
    levels.push(node)

    return node
  }

  const dry = stage(graph.dry)
  const drum = stage(graph.drum)
  const rev = stage(graph.rev)
  const dly = stage(graph.dly)
  const duck = ctx.createGain()

  duck.connect(stage(graph.bed))

  const all = [...levels, duck]

  return {
    ctx,
    noise: graph.noise,
    dry,
    drum,
    rev,
    dly,
    duck,
    fade: (at, seconds) => {
      for (const node of levels) {
        node.gain.setTargetAtTime(0, at, Math.max(0.004, seconds / 4))
      }
    },
    dispose: () => {
      for (const node of all) {
        node.disconnect()
      }
    },
  }
}

interface SendOptions {
  dry?: number
  rev?: number
  dly?: number
  bus?: AudioNode
}

const send = (g: Bus, node: AudioNode, options: SendOptions = {}): void => {
  const { dry = 1, rev = 0, dly = 0, bus } = options
  const direct = g.ctx.createGain()

  direct.gain.value = dry
  node.connect(direct)
  direct.connect(bus ?? g.dry)

  if (rev) {
    const reverb = g.ctx.createGain()

    reverb.gain.value = rev
    node.connect(reverb)
    reverb.connect(g.rev)
  }

  if (dly) {
    const echo = g.ctx.createGain()

    echo.gain.value = dly
    node.connect(echo)
    echo.connect(g.dly)
  }
}

interface Env {
  /** Attack, seconds. */
  a: number
  /** Peak gain. */
  pk: number
  /** Decay, seconds. */
  d: number
}

const envelope = (g: Bus, w: number, { a, pk, d }: Env): GainNode => {
  const node = g.ctx.createGain()

  node.gain.setValueAtTime(0.0001, w)
  node.gain.exponentialRampToValueAtTime(Math.max(pk, 0.0002), w + a)
  node.gain.exponentialRampToValueAtTime(0.0001, w + a + d)

  return node
}

const noiseSource = (
  g: Bus,
  w: number,
  seconds: number,
): AudioBufferSourceNode => {
  const source = g.ctx.createBufferSource()

  source.buffer = g.noise
  source.loop = true
  source.start(w, (w * 7.3) % 1.5)
  source.stop(w + seconds)

  return source
}

const filter = (
  g: Bus,
  type: BiquadFilterType,
  frequency: number,
): BiquadFilterNode => {
  const node = g.ctx.createBiquadFilter()

  node.type = type
  node.frequency.value = frequency

  return node
}

/** Sets a filter's resonance and hands it back. */
const resonant = (node: BiquadFilterNode, q: number): BiquadFilterNode => {
  node.Q.value = q

  return node
}

const tone = (g: Bus, type: OscillatorType, hz: number): OscillatorNode => {
  const node = g.ctx.createOscillator()

  node.type = type
  node.frequency.value = hz

  return node
}

/** Detunes an oscillator, in cents, and hands it back. */
const detuned = (node: OscillatorNode, cents: number): OscillatorNode => {
  node.detune.value = cents

  return node
}

const busNode = (g: Bus, name: BusName | undefined): AudioNode | undefined => {
  if (name === undefined) {
    return undefined
  }

  return g[name]
}

export interface Notes {
  notes: readonly number[]
}

interface KickParams {
  v?: number
  lp?: number
}

const kick = (g: Bus, w: number, { v = 1, lp = 0 }: KickParams): void => {
  const thump = g.ctx.createOscillator()

  thump.type = "sine"
  thump.frequency.setValueAtTime(165, w)
  thump.frequency.exponentialRampToValueAtTime(52, w + 0.085)

  const body = envelope(g, w, { a: 0.002, pk: 0.95 * v, d: 0.3 })
  let tail: AudioNode = body

  thump.connect(body)

  if (lp) {
    const rounded = filter(g, "lowpass", lp)

    body.connect(rounded)
    tail = rounded
  }

  send(g, tail, { bus: g.drum })
  thump.start(w)
  thump.stop(w + 0.34)

  const beater = g.ctx.createOscillator()

  beater.type = "triangle"
  beater.frequency.setValueAtTime(420, w)
  beater.frequency.exponentialRampToValueAtTime(150, w + 0.03)

  const beaterGain = envelope(g, w, { a: 0.001, pk: 0.42 * v, d: 0.06 })

  beater.connect(beaterGain)
  send(g, beaterGain, { bus: g.drum })
  beater.start(w)
  beater.stop(w + 0.08)

  const click = noiseSource(g, w, 0.02)
  const clickFilter = filter(g, "highpass", 2600)
  const clickGain = envelope(g, w, {
    a: 0.001,
    pk: 0.2 * v * (lp ? 0.25 : 1),
    d: 0.012,
  })

  click.connect(clickFilter)
  clickFilter.connect(clickGain)
  send(g, clickGain, { bus: g.drum })

  g.duck.gain.cancelScheduledValues(w)
  g.duck.gain.setValueAtTime(0.55, w)
  g.duck.gain.linearRampToValueAtTime(1, w + 0.2)
}

const CLAP_LAYERS = [
  [0, 0.5],
  [0.012, 0.42],
  [0.024, 0.5],
] as const

const clap = (g: Bus, w: number, { v = 1 }: { v?: number }): void => {
  for (const [offset, peak] of CLAP_LAYERS) {
    const source = noiseSource(g, w + offset, 0.14)
    const band = resonant(filter(g, "bandpass", 1700), 1.1)
    const gain = envelope(g, w + offset, {
      a: 0.001,
      pk: peak * v,
      d: offset === 0.024 ? 0.13 : 0.018,
    })

    source.connect(band)
    band.connect(gain)
    send(g, gain, { dry: 0.8, rev: 0.2, bus: g.drum })
  }
}

const hat = (g: Bus, w: number, p: { v?: number; d?: number }): void => {
  const { v = 0.5, d = 0.03 } = p
  const source = noiseSource(g, w, d + 0.03)
  const bright = filter(g, "highpass", 7200)
  const gain = envelope(g, w, { a: 0.001, pk: 0.34 * v, d })

  source.connect(bright)
  bright.connect(gain)
  send(g, gain, { bus: g.duck })
}

interface BassParams {
  m: number
  dur: number
  cut?: number
  v?: number
}

const BASS_OSCILLATORS = [
  ["sawtooth", 0, 0.7],
  ["square", -6, 0.35],
  ["sine", 0, 0.9],
] as const

const bass = (g: Bus, w: number, p: BassParams): void => {
  const { m, dur, cut = 500, v = 1 } = p
  const gain = envelope(g, w, { a: 0.004, pk: 0.3 * v, d: dur })
  const lowpass = resonant(filter(g, "lowpass", cut * 2.2), 4)

  lowpass.frequency.setValueAtTime(cut * 2.2, w)
  lowpass.frequency.exponentialRampToValueAtTime(cut, w + dur * 0.8)

  for (const [type, detune, level] of BASS_OSCILLATORS) {
    const osc = detuned(tone(g, type, midiHz(m)), detune)
    const trim = g.ctx.createGain()

    trim.gain.value = level
    osc.connect(trim)
    trim.connect(lowpass)
    osc.start(w)
    osc.stop(w + dur + 0.06)
  }

  lowpass.connect(gain)
  send(g, gain, { bus: g.duck })
}

interface PluckParams {
  m: number
  v?: number
  rev?: number
  dly?: number
  bus?: BusName
}

const PLUCK_OSCILLATORS = [
  ["triangle", 0, 1],
  ["sawtooth", 7, 0.32],
] as const

const pluck = (g: Bus, w: number, p: PluckParams): void => {
  const { m, v = 0.5, rev = 0.25, dly = 0.3, bus } = p
  const gain = envelope(g, w, { a: 0.002, pk: 0.3 * v, d: 0.3 })
  const lowpass = filter(g, "lowpass", 5200)

  lowpass.frequency.setValueAtTime(5200, w)
  lowpass.frequency.exponentialRampToValueAtTime(900, w + 0.22)

  for (const [type, detune, level] of PLUCK_OSCILLATORS) {
    const osc = detuned(tone(g, type, midiHz(m)), detune)
    const trim = g.ctx.createGain()

    trim.gain.value = level
    osc.connect(trim)
    trim.connect(lowpass)
    osc.start(w)
    osc.stop(w + 0.4)
  }

  lowpass.connect(gain)
  send(g, gain, { rev, dly, bus: busNode(g, bus) ?? g.duck })
}

interface StabParams extends Notes {
  dur: number
  v?: number
  cut?: number
  rev?: number
  dly?: number
}

const stab = (g: Bus, w: number, p: StabParams): void => {
  const { notes, dur, v = 0.5, cut = 2200, rev = 0.3, dly = 0.2 } = p
  const gain = envelope(g, w, { a: 0.005, pk: 0.2 * v, d: dur })
  const lowpass = resonant(filter(g, "lowpass", cut), 1.2)

  lowpass.frequency.setValueAtTime(cut, w)
  lowpass.frequency.exponentialRampToValueAtTime(
    Math.max(400, cut * 0.35),
    w + dur,
  )

  for (const m of notes) {
    for (const detune of [-9, 9]) {
      const osc = detuned(tone(g, "sawtooth", midiHz(m + 12)), detune)

      osc.connect(lowpass)
      osc.start(w)
      osc.stop(w + dur + 0.08)
    }
  }

  lowpass.connect(gain)
  send(g, gain, { rev, dly, bus: g.duck })
}

interface PadParams extends Notes {
  dur: number
  v?: number
  cut?: number
}

const pad = (g: Bus, w: number, p: PadParams): void => {
  const { notes, dur, v = 0.1, cut = 800 } = p
  const gain = g.ctx.createGain()

  gain.gain.setValueAtTime(0.0001, w)
  gain.gain.linearRampToValueAtTime(v, w + Math.min(0.5, dur * 0.3))
  gain.gain.setValueAtTime(v, w + dur - 0.2)
  gain.gain.linearRampToValueAtTime(0.0001, w + dur + 0.5)

  const lowpass = resonant(filter(g, "lowpass", cut), 0.8)

  for (const m of notes) {
    for (const detune of [-11, 0, 11]) {
      const osc = detuned(tone(g, "sawtooth", midiHz(m + 12)), detune)
      const trim = g.ctx.createGain()

      trim.gain.value = 0.12
      osc.connect(trim)
      trim.connect(lowpass)
      osc.start(w)
      osc.stop(w + dur + 0.55)
    }
  }

  lowpass.connect(gain)
  send(g, gain, { dry: 0.8, rev: 0.5 })
}

interface RiserParams {
  dur: number
  v?: number
  lo?: number
  hi?: number
}

const riser = (g: Bus, w: number, p: RiserParams): void => {
  const { dur, v = 0.3, lo = 500, hi = 9000 } = p
  const source = noiseSource(g, w, dur + 0.02)
  const band = resonant(filter(g, "bandpass", lo), 1.6)

  band.frequency.setValueAtTime(lo, w)
  band.frequency.exponentialRampToValueAtTime(hi, w + dur)

  const gain = g.ctx.createGain()

  gain.gain.setValueAtTime(0.0001, w)
  gain.gain.exponentialRampToValueAtTime(v, w + dur)
  gain.gain.linearRampToValueAtTime(0.0001, w + dur + 0.02)
  source.connect(band)
  band.connect(gain)
  send(g, gain, { dry: 0.9, rev: 0.2 })
}

const whoosh = (g: Bus, w: number, p: { dur?: number; v?: number }): void => {
  const { dur = 0.5, v = 0.22 } = p
  const source = noiseSource(g, w, dur + 0.05)
  const band = resonant(filter(g, "bandpass", 600), 2.4)

  band.frequency.setValueAtTime(600, w)
  band.frequency.exponentialRampToValueAtTime(5200, w + dur * 0.55)
  band.frequency.exponentialRampToValueAtTime(1100, w + dur)

  const gain = g.ctx.createGain()

  gain.gain.setValueAtTime(0.0001, w)
  gain.gain.exponentialRampToValueAtTime(v, w + dur * 0.5)
  gain.gain.exponentialRampToValueAtTime(0.0001, w + dur)
  source.connect(band)
  band.connect(gain)
  send(g, gain, { rev: 0.2 })
}

const impact = (g: Bus, w: number, p: { v?: number; rev?: number }): void => {
  const { v = 1, rev = 0.5 } = p
  const sub = g.ctx.createOscillator()

  sub.type = "sine"
  sub.frequency.setValueAtTime(120, w)
  sub.frequency.exponentialRampToValueAtTime(36, w + 0.34)

  const subGain = envelope(g, w, { a: 0.003, pk: 0.72 * v, d: 0.8 })

  sub.connect(subGain)
  send(g, subGain)
  sub.start(w)
  sub.stop(w + 0.9)

  const crack = g.ctx.createOscillator()

  crack.type = "sawtooth"
  crack.frequency.setValueAtTime(420, w)
  crack.frequency.exponentialRampToValueAtTime(110, w + 0.12)

  const crackFilter = filter(g, "lowpass", 2400)

  crackFilter.frequency.setValueAtTime(2400, w)
  crackFilter.frequency.exponentialRampToValueAtTime(500, w + 0.2)

  const crackGain = envelope(g, w, { a: 0.001, pk: 0.62 * v, d: 0.22 })

  crack.connect(crackFilter)
  crackFilter.connect(crackGain)
  send(g, crackGain, { rev: 0.25 })
  crack.start(w)
  crack.stop(w + 0.3)

  const air = noiseSource(g, w, 0.5)
  const airFilter = filter(g, "lowpass", 6400)

  airFilter.frequency.setValueAtTime(6400, w)
  airFilter.frequency.exponentialRampToValueAtTime(600, w + 0.4)

  const airGain = envelope(g, w, { a: 0.001, pk: 0.6 * v, d: 0.42 })

  air.connect(airFilter)
  airFilter.connect(airGain)
  send(g, airGain, { rev })
}

const clunk = (g: Bus, w: number, p: { m: number; v?: number }): void => {
  const { m, v = 0.9 } = p
  const thud = g.ctx.createOscillator()

  thud.type = "sine"
  thud.frequency.setValueAtTime(190, w)
  thud.frequency.exponentialRampToValueAtTime(84, w + 0.07)

  const thudGain = envelope(g, w, { a: 0.001, pk: 0.55 * v, d: 0.13 })

  thud.connect(thudGain)
  send(g, thudGain)
  thud.start(w)
  thud.stop(w + 0.2)

  const knock = noiseSource(g, w, 0.05)
  const knockFilter = resonant(filter(g, "bandpass", 1500), 0.9)
  const knockGain = envelope(g, w, { a: 0.001, pk: 0.6 * v, d: 0.035 })

  knock.connect(knockFilter)
  knockFilter.connect(knockGain)
  send(g, knockGain, { rev: 0.18 })
  pluck(g, w, { m, v: 0.75 * v, rev: 0.34, dly: 0.18, bus: "dry" })
}

const flap = (g: Bus, w: number, p: { n?: number; v?: number }): void => {
  const { n = 5, v = 0.3 } = p

  for (let i = 0; i < n; i += 1) {
    const at = w + i * 0.026 + seed(i + w) * 0.008
    const source = noiseSource(g, at, 0.02)
    const band = resonant(
      filter(g, "bandpass", 2400 + seed(i * 3 + w) * 1600),
      1.3,
    )
    const gain = envelope(g, at, {
      a: 0.0007,
      pk: v * (1 - i / (n + 2)),
      d: 0.014,
    })

    source.connect(band)
    band.connect(gain)
    send(g, gain)
  }
}

const TICK_PARTIALS = [
  ["triangle", 0, 1],
  ["sine", 12, 0.5],
] as const

const tick = (g: Bus, w: number, p: { m: number; v?: number }): void => {
  const { m, v = 0.7 } = p

  for (const [type, interval, level] of TICK_PARTIALS) {
    const gain = envelope(g, w, { a: 0.001, pk: 0.42 * v * level, d: 0.16 })
    const osc = tone(g, type, midiHz(m + interval))

    osc.connect(gain)
    send(g, gain, { rev: 0.12 })
    osc.start(w)
    osc.stop(w + 0.2)
  }

  const click = noiseSource(g, w, 0.012)
  const clickFilter = filter(g, "highpass", 3200)
  const clickGain = envelope(g, w, { a: 0.0006, pk: 0.3 * v, d: 0.008 })

  click.connect(clickFilter)
  clickFilter.connect(clickGain)
  send(g, clickGain)
}

const roll = (g: Bus, w: number, p: { dur: number; v?: number }): void => {
  const { dur, v = 0.5 } = p
  const end = w + dur
  let at = w

  while (at < end) {
    const progress = (at - w) / dur
    const gap = mix(0.125, 0.0625, clamp(progress * 1.4))
    const source = noiseSource(g, at, 0.09)
    const band = resonant(filter(g, "bandpass", 2100), 0.8)
    const gain = envelope(g, at, {
      a: 0.001,
      pk: mix(0.1, 0.5, progress * progress) * v * 1.6,
      d: 0.05,
    })

    source.connect(band)
    band.connect(gain)
    send(g, gain, { rev: 0.1 })

    const skin = tone(g, "triangle", 196)
    const skinGain = envelope(g, at, {
      a: 0.001,
      pk: mix(0.08, 0.3, progress) * v * 1.5,
      d: 0.05,
    })

    skin.connect(skinGain)
    send(g, skinGain)
    skin.start(at)
    skin.stop(at + 0.08)
    at += gap
  }
}

const chord = (
  g: Bus,
  w: number,
  p: Notes & { v?: number; dur?: number },
): void => {
  const { notes, v = 1, dur = 2.4 } = p

  stab(g, w, { notes, dur, v, cut: 5200, rev: 0.55, dly: 0.3 })

  for (const m of notes) {
    for (const k of [0, 1]) {
      pluck(g, w + k * 0.0625, {
        m: m + 24 + k * 12,
        v: 0.42 * v,
        rev: 0.5,
        dly: 0.3,
        bus: "dry",
      })
    }
  }
}

const crash = (g: Bus, w: number, p: { v?: number; d?: number }): void => {
  const { v = 0.5, d = 2.6 } = p
  const source = noiseSource(g, w, d)
  const bright = filter(g, "highpass", 3600)
  const gain = envelope(g, w, { a: 0.002, pk: v, d })

  source.connect(bright)
  bright.connect(gain)
  send(g, gain, { rev: 0.4 })
}

const SWELL_SECONDS = 0.76

/**
 * A low sawtooth swell, the prototype's "hold" under the spotlight. The
 * prototype hard-codes 0.76 s; `dur` stretches the same curve.
 */
const swell = (
  g: Bus,
  w: number,
  p: Notes & { dur?: number; v?: number; cut?: number },
): void => {
  const { notes, dur = SWELL_SECONDS, v = 0.14, cut = 520 } = p
  const rise = dur * (0.72 / SWELL_SECONDS)

  for (const m of notes) {
    const osc = tone(g, "sawtooth", midiHz(m))
    const lowpass = filter(g, "lowpass", cut)
    const gain = g.ctx.createGain()

    gain.gain.setValueAtTime(0.0001, w)
    gain.gain.exponentialRampToValueAtTime(v, w + rise)
    gain.gain.linearRampToValueAtTime(0.0001, w + dur)
    osc.connect(lowpass)
    lowpass.connect(gain)
    send(g, gain)
    osc.start(w)
    osc.stop(w + dur + 0.04)
  }
}

/** Every voice, keyed by the name scenes use in their event lists. */
export const INSTRUMENTS = {
  kick,
  clap,
  hat,
  bass,
  pluck,
  stab,
  pad,
  riser,
  whoosh,
  impact,
  clunk,
  flap,
  tick,
  roll,
  chord,
  crash,
  swell,
} as const

export type InstrumentName = keyof typeof INSTRUMENTS

export type InstrumentParams = {
  [K in InstrumentName]: Parameters<(typeof INSTRUMENTS)[K]>[2]
}

/** One voice at one moment, in seconds from its scene's anchor. */
export type SceneEvent = {
  [K in InstrumentName]: { t: number; inst: K; p: InstrumentParams[K] }
}[InstrumentName]

/** Plays one event into a bus at audio time `when`. */
export const playEvent = (bus: Bus, event: SceneEvent, when: number): void => {
  // The union is correlated (`inst` picks the parameter type), which
  // TypeScript cannot follow through an indexed call, hence the cast.
  const voice = INSTRUMENTS[event.inst] as (
    g: Bus,
    w: number,
    p: SceneEvent["p"],
  ) => void

  voice(bus, when, event.p)
}
