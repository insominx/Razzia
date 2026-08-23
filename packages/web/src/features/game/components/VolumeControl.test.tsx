import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { state } = vi.hoisted(() => ({
  state: {
    volume: 1,
    muted: false,
    setVolume: vi.fn(),
    toggleMute: vi.fn(),
    unlock: vi.fn(),
  },
}))

vi.mock("@razzia/web/features/game/stores/sound", () => ({
  useSoundStore: (selector: (s: typeof state) => unknown) => selector(state),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const VolumeControl = (
  await import("@razzia/web/features/game/components/VolumeControl")
).default

const trigger = () => screen.getByRole("button")
const slider = () => screen.getByRole("slider")

describe("VolumeControl", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.volume = 1
    state.muted = false
  })

  // Vitest runs without `globals`, so Testing Library never registers its own
  // auto-cleanup and renders would otherwise stack up in the document.
  afterEach(cleanup)

  it("opens on the first press instead of muting, then mutes", () => {
    render(<VolumeControl />)

    fireEvent.click(trigger())
    expect(state.toggleMute).not.toHaveBeenCalled()

    fireEvent.click(trigger())
    expect(state.toggleMute).toHaveBeenCalledTimes(1)
  })

  it("mutes on the first press once hovering has opened it", () => {
    const { container } = render(<VolumeControl />)

    fireEvent.pointerEnter(container.firstChild as Element)
    fireEvent.click(trigger())

    expect(state.toggleMute).toHaveBeenCalledTimes(1)
  })

  it("unlocks the audio context on every press", () => {
    render(<VolumeControl />)

    fireEvent.click(trigger())

    expect(state.unlock).toHaveBeenCalledTimes(1)
  })

  it("reports a dragged level to the store", () => {
    render(<VolumeControl />)

    fireEvent.change(slider(), { target: { value: "0.35" } })

    expect(state.setVolume).toHaveBeenCalledWith(0.35)
  })

  it("shows the slider at zero while muted", () => {
    state.muted = true
    state.volume = 0.6

    render(<VolumeControl />)

    expect(slider()).toHaveValue("0")
    expect(trigger()).toHaveAccessibleName("common:sound.unmute")
  })

  it("labels the trigger for muting while audible", () => {
    render(<VolumeControl />)

    expect(trigger()).toHaveAccessibleName("common:sound.mute")
  })
})
