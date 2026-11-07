import type { EmitListener } from "@razzia/web/features/rehearse/fake-socket"
import type { FrameMeasurement } from "@razzia/web/features/dev/fit"
import type { FixtureRef, GameStatus } from "@razzia/web/features/dev/fixtures"

/**
 * What a harness frame (`/dev/frame`) offers the Director page that embeds it.
 * The two are the same origin, so the page calls straight into the frame's
 * window: no message protocol, and each frame keeps its own stores and sound.
 */
export interface DirectorApi {
  /** Mount a fixture's screen fresh, as a page load would. */
  showFixture: (ref: FixtureRef) => void
  /** A live status from the server. Same screen type updates in place. */
  showStatus: (status: GameStatus) => void
  /** A server event, such as `game:cooldown`, to whoever subscribed. */
  deliver: (event: string, ...args: unknown[]) => void
  /** What the screens emit toward the server (tapped answers, Next). */
  onEmit: (listener: EmitListener) => () => void
  /** Resolves when fonts have loaded and layout has had a moment to settle. */
  settle: () => Promise<void>
  measure: () => FrameMeasurement
}

const DIRECTOR_KEY = "__razzia_director"

type WithDirector = Record<string, DirectorApi | undefined>

export const getDirector = (
  win: Window | null | undefined,
): DirectorApi | null =>
  win ? ((win as unknown as WithDirector)[DIRECTOR_KEY] ?? null) : null

export const publishDirector = (win: Window, api: DirectorApi | null) => {
  if (api) {
    ;(win as unknown as WithDirector)[DIRECTOR_KEY] = api
  } else {
    Reflect.deleteProperty(win, DIRECTOR_KEY)
  }
}

/**
 * Resolves once the frame behind `getWindow` has mounted and published its API.
 * A frame loads its bundle and mounts React after the iframe's `load` event, so
 * the page polls rather than trusting `onLoad`.
 */
export const waitForDirector = (
  getWindow: () => Window | null | undefined,
  { timeoutMs = 20_000, intervalMs = 40 } = {},
): Promise<DirectorApi> =>
  new Promise((resolve, reject) => {
    const started = Date.now()

    const poll = () => {
      const api = getDirector(getWindow())

      if (api) {
        resolve(api)
      } else if (Date.now() - started > timeoutMs) {
        reject(new Error("The frame never started"))
      } else {
        setTimeout(poll, intervalMs)
      }
    }

    poll()
  })
