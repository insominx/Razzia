/**
 * Test doubles for Web Audio (jsdom has none) and a manual clock.
 *
 * `fakeContext()` implements just enough of `BaseAudioContext` for the score's
 * graph and voices, and records what was created so a test can assert that
 * nothing was scheduled, or when.
 */
import {
  createGraph,
  type Graph,
} from "@razzia/web/features/game/audio/instruments"

interface ParamCall {
  method: string
  args: number[]
}

export interface FakeParam {
  value: number
  calls: ParamCall[]
  setValueAtTime: (value: number, time: number) => FakeParam
  linearRampToValueAtTime: (value: number, time: number) => FakeParam
  exponentialRampToValueAtTime: (value: number, time: number) => FakeParam
  setTargetAtTime: (target: number, time: number, constant: number) => FakeParam
  cancelScheduledValues: (time: number) => FakeParam
}

const fakeParam = (): FakeParam => {
  const calls: ParamCall[] = []
  const record =
    (method: string) =>
    (...args: number[]): FakeParam => {
      calls.push({ method, args })

      return param
    }
  const param: FakeParam = {
    value: 0,
    calls,
    setValueAtTime: record("setValueAtTime"),
    linearRampToValueAtTime: record("linearRampToValueAtTime"),
    exponentialRampToValueAtTime: record("exponentialRampToValueAtTime"),
    setTargetAtTime: record("setTargetAtTime"),
    cancelScheduledValues: record("cancelScheduledValues"),
  }

  return param
}

export interface FakeNode {
  kind: string
  connections: unknown[]
  disconnected: number
  started: number[]
  stopped: number[]
  gain: FakeParam
  frequency: FakeParam
  detune: FakeParam
  Q: FakeParam
  delayTime: FakeParam
  threshold: FakeParam
  knee: FakeParam
  ratio: FakeParam
  attack: FakeParam
  release: FakeParam
  type: string
  curve: unknown
  oversample: string
  buffer: unknown
  loop: boolean
  connect: (target: unknown) => unknown
  disconnect: () => void
  start: (when?: number) => void
  stop: (when?: number) => void
}

export const fakeNode = (kind: string): FakeNode => {
  const node: FakeNode = {
    kind,
    connections: [],
    disconnected: 0,
    started: [],
    stopped: [],
    gain: fakeParam(),
    frequency: fakeParam(),
    detune: fakeParam(),
    Q: fakeParam(),
    delayTime: fakeParam(),
    threshold: fakeParam(),
    knee: fakeParam(),
    ratio: fakeParam(),
    attack: fakeParam(),
    release: fakeParam(),
    type: "",
    curve: null,
    oversample: "",
    buffer: null,
    loop: false,
    connect: (target) => {
      node.connections.push(target)

      return target
    },
    disconnect: () => {
      node.disconnected += 1
    },
    start: (when = 0) => {
      node.started.push(when)
    },
    stop: (when = 0) => {
      node.stopped.push(when)
    },
  }

  return node
}

export interface FakeAudioContext {
  currentTime: number
  sampleRate: number
  state: "running" | "suspended" | "closed"
  destination: FakeNode
  nodes: FakeNode[]
  resumed: number
  createGain: () => FakeNode
  createOscillator: () => FakeNode
  createBiquadFilter: () => FakeNode
  createBufferSource: () => FakeNode
  createConvolver: () => FakeNode
  createDelay: () => FakeNode
  createDynamicsCompressor: () => FakeNode
  createWaveShaper: () => FakeNode
  createBuffer: (
    channels: number,
    length: number,
  ) => { getChannelData: (channel: number) => Float32Array }
  resume: () => Promise<void>
  /** Counts the sources (oscillators and noise) that were started. */
  voicesStarted: () => number
}

export const fakeContext = (): FakeAudioContext => {
  const nodes: FakeNode[] = []
  const make = (kind: string) => (): FakeNode => {
    const node = fakeNode(kind)

    nodes.push(node)

    return node
  }
  const ctx: FakeAudioContext = {
    currentTime: 0,
    sampleRate: 8000,
    state: "running",
    destination: fakeNode("destination"),
    nodes,
    resumed: 0,
    createGain: make("gain"),
    createOscillator: make("oscillator"),
    createBiquadFilter: make("filter"),
    createBufferSource: make("source"),
    createConvolver: make("convolver"),
    createDelay: make("delay"),
    createDynamicsCompressor: make("compressor"),
    createWaveShaper: make("shaper"),
    createBuffer: (channels, length) => {
      const data = Array.from(
        { length: channels },
        () => new Float32Array(length),
      )

      return { getChannelData: (channel) => data[channel] }
    },
    resume: () => {
      ctx.resumed += 1
      ctx.state = "running"

      return Promise.resolve()
    },
    voicesStarted: () =>
      nodes.filter(
        (node) =>
          (node.kind === "oscillator" || node.kind === "source") &&
          node.started.length > 0,
      ).length,
  }

  return ctx
}

export const asContext = (ctx: FakeAudioContext): BaseAudioContext =>
  ctx as unknown as BaseAudioContext

export const fakeGraph = (ctx: FakeAudioContext): Graph =>
  createGraph(asContext(ctx), ctx.destination as unknown as AudioNode)

interface Scheduled {
  id: number
  at: number
  every?: number
  fn: () => void
}

export interface ManualClock {
  /** Epoch milliseconds "now". */
  time: number
  now: () => number
  setTimeout: (fn: () => void, ms: number) => unknown
  setInterval: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
  clearInterval: (handle: unknown) => void
  /** Number of live intervals. */
  intervals: () => number
  /** Number of live timers of any kind. */
  pending: () => number
  /** Moves time forward, running whatever falls due, in order. */
  advance: (ms: number) => void
  timers: () => Pick<
    ManualClock,
    "setTimeout" | "setInterval" | "clearTimeout" | "clearInterval"
  >
}

/** A manual clock with the timer functions the controller injects. */
export const manualClock = (): ManualClock => {
  const tasks = new Map<number, Scheduled>()
  let seq = 0
  const add = (fn: () => void, ms: number, every?: number): unknown => {
    seq += 1
    tasks.set(seq, { id: seq, at: clock.time + ms, every, fn })

    return seq
  }
  const remove = (handle: unknown): void => {
    tasks.delete(handle as number)
  }
  const clock: ManualClock = {
    time: 1_000_000,
    now: () => clock.time,
    setTimeout: (fn, ms) => add(fn, ms),
    setInterval: (fn, ms) => add(fn, ms, ms),
    clearTimeout: remove,
    clearInterval: remove,
    intervals: () => [...tasks.values()].filter((task) => task.every).length,
    pending: () => tasks.size,
    advance: (ms) => {
      const end = clock.time + ms

      for (;;) {
        const due = [...tasks.values()]
          .filter((task) => task.at <= end)
          .sort((a, b) => a.at - b.at || a.id - b.id)
          .at(0)

        if (!due) {
          break
        }

        clock.time = Math.max(clock.time, due.at)

        if (due.every) {
          due.at += due.every
        } else {
          tasks.delete(due.id)
        }

        due.fn()
      }

      clock.time = end
    },
    timers: () => ({
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      setInterval: clock.setInterval,
      clearInterval: clock.clearInterval,
    }),
  }

  return clock
}
