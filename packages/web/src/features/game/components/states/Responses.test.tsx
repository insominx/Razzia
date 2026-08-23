import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import { cleanup, render, screen } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

interface SoundMock {
  play: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  options: Record<string, unknown>
}

// `use-sound` returns `useCallback`s over its Howl, so a real screen sees the
// same `play` identity across renders. Keying the mocks by `src` reproduces
// that: fresh callbacks per render would refire the effects under test.
const { sounds } = vi.hoisted(() => ({
  sounds: new Map<string, SoundMock>(),
}))

vi.mock("use-sound", () => ({
  default: (src: string, options: Record<string, unknown>) => {
    const existing = sounds.get(src)

    if (existing) {
      existing.options = options

      return [existing.play, { stop: existing.stop }]
    }

    const created: SoundMock = { play: vi.fn(), stop: vi.fn(), options }
    sounds.set(src, created)

    return [created.play, { stop: created.stop }]
  },
}))

// Path resolution is `use-sfx.test.tsx`'s job; here the classic path is the key.
vi.mock("@razzia/web/features/game/hooks/use-sfx", () => ({
  useSfx: () => (classicPath: string) => classicPath,
}))

const MUSIC = "/sounds/answersMusic.mp3"
const RESULTS = "/sounds/results.mp3"

const soundFor = (src: string): SoundMock => {
  const sound = sounds.get(src)

  if (!sound) {
    throw new Error(`no sound registered for ${src}`)
  }

  return sound
}

const DATA: ManagerStatusDataMap["SHOW_RESPONSES"] = {
  question: "Which one?",
  answers: ["Alpha", "Beta", "Gamma", "Delta"],
  responses: { 0: 12, 1: 2, 2: 3, 3: 1 },
  solutions: [0],
}

const renderResponses = async (
  data: ManagerStatusDataMap["SHOW_RESPONSES"] = DATA,
) => {
  const { default: Responses } =
    await import("@razzia/web/features/game/components/states/Responses")

  return render(<Responses data={data} />)
}

// The count closes its row, so the row is the count's parent, and `data-bar`
// marks the fill inside the row's track — steadier than selecting on the inline
// style, and it keeps the row itself reachable for the dimming assertions.
const rowOf = (count: HTMLElement): HTMLElement => {
  const row = count.parentElement

  if (!row) {
    throw new Error(`no row around count ${count.textContent}`)
  }

  return row
}

const barOf = (count: HTMLElement): HTMLElement => {
  const bar = rowOf(count).querySelector<HTMLElement>("[data-bar]")

  if (!bar) {
    throw new Error(`no bar in the row for count ${count.textContent}`)
  }

  return bar
}

const barFor = (count: number): HTMLElement =>
  barOf(screen.getByText(String(count)))

const rowFor = (count: number): HTMLElement =>
  rowOf(screen.getByText(String(count)))

describe("Responses", () => {
  // `globals` is off, so RTL never registers its own teardown and each render
  // would otherwise stack another copy of the screen onto the same body.
  beforeEach(() => {
    cleanup()
    sounds.clear()
  })

  it("paints the bars from the responses on first render", async () => {
    await renderResponses()

    expect(barFor(12).style.width).toBe("67%")
    expect(barFor(2).style.width).toBe("11%")
    expect(barFor(3).style.width).toBe("17%")
    expect(barFor(1).style.width).toBe("6%")
  })

  it("states each share next to its bar", async () => {
    await renderResponses()

    expect(screen.getByText("67%")).toBeInTheDocument()
    expect(screen.getByText("11%")).toBeInTheDocument()
    expect(screen.getByText("17%")).toBeInTheDocument()
    expect(screen.getByText("6%")).toBeInTheDocument()
  })

  // Correctness is the tiles' job; the rows only recede so the solution's row
  // is the one at full strength.
  it("dims every row but the solution's", async () => {
    await renderResponses()

    expect(rowFor(12).className).not.toContain("opacity-80")
    expect(rowFor(2).className).toContain("opacity-80")
    expect(rowFor(3).className).toContain("opacity-80")
    expect(rowFor(1).className).toContain("opacity-80")
  })

  // Effects never run in a server render, so this is the one place that can
  // tell a render-time derivation apart from a state write in `useEffect`
  // (which `render` would flush before any assertion could see the gap).
  it("has the widths on the very first paint, before any effect", async () => {
    const { default: Responses } =
      await import("@razzia/web/features/game/components/states/Responses")

    const markup = renderToStaticMarkup(<Responses data={DATA} />)

    expect(markup).toContain("width:67%")
    expect(markup).toContain("width:11%")
    expect(markup).toContain("width:17%")
    expect(markup).toContain("width:6%")
  })

  // A width has no "auto" that reads as empty the way an unset height did: an
  // unset one fills the whole track, so an unanswered question has to land on
  // an explicit zero — once for a key that is missing entirely, and once for a
  // key that is present but zero, which used to divide by zero into `NaN%`.
  it("renders empty bars when nobody answered", async () => {
    await renderResponses({ ...DATA, responses: {} })

    const bars = screen.getAllByText("0").map(barOf)

    expect(bars).toHaveLength(4)
    expect(bars.map((bar) => bar.style.width)).toEqual(["0%", "0%", "0%", "0%"])
    expect(screen.getAllByText("0%")).toHaveLength(4)
  })

  it("renders empty bars when every answer drew a zero", async () => {
    await renderResponses({ ...DATA, responses: { 0: 0, 1: 0, 2: 0, 3: 0 } })

    const bars = screen.getAllByText("0").map(barOf)

    expect(bars.map((bar) => bar.style.width)).toEqual(["0%", "0%", "0%", "0%"])
    expect(screen.getAllByText("0%")).toHaveLength(4)
  })

  it("plays the results sting once per mount", async () => {
    const { rerender } = await renderResponses()
    const { default: Responses } =
      await import("@razzia/web/features/game/components/states/Responses")

    expect(soundFor(RESULTS).play).toHaveBeenCalledTimes(1)

    rerender(<Responses data={DATA} />)

    expect(soundFor(RESULTS).play).toHaveBeenCalledTimes(1)
  })

  it("loops the answers bed instead of restarting it by hand", async () => {
    await renderResponses()

    expect(soundFor(MUSIC).options).toMatchObject({
      interrupt: true,
      loop: true,
    })
    expect(soundFor(MUSIC).options.onend).toBeUndefined()
    expect(soundFor(MUSIC).play).toHaveBeenCalledTimes(1)
  })

  it("stops the answers bed on unmount", async () => {
    const { unmount } = await renderResponses()

    expect(soundFor(MUSIC).stop).not.toHaveBeenCalled()

    unmount()

    expect(soundFor(MUSIC).stop).toHaveBeenCalled()
  })
})
