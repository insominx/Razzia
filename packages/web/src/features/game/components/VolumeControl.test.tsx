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

const trigger = () =>
  screen.getByRole("button", { name: /common:sound\.(mute|unmute)/ })
const slider = () => screen.getByRole("slider")
const querySlider = () => screen.queryByRole("slider")
const control = (): HTMLDivElement => {
  const root = trigger().parentElement

  if (!(root instanceof HTMLDivElement)) {
    throw new TypeError("Expected the volume trigger to be inside its control")
  }

  return root
}

const touchPress = () => {
  fireEvent.pointerDown(trigger(), { pointerType: "touch" })
  fireEvent.click(trigger())
}

describe("VolumeControl", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.volume = 1
    state.muted = false
  })

  afterEach(cleanup)

  it("keeps the closed slider out of the focus tree", () => {
    render(<VolumeControl />)

    expect(querySlider()).not.toBeInTheDocument()
    expect(trigger()).toHaveAttribute("aria-expanded", "false")
    expect(trigger()).toHaveAttribute("aria-controls")
  })

  it("opens and closes on hover only for a mouse pointer", () => {
    render(<VolumeControl />)

    fireEvent.pointerEnter(control(), { pointerType: "touch" })
    expect(querySlider()).not.toBeInTheDocument()

    fireEvent.pointerEnter(control(), { pointerType: "mouse" })
    expect(slider()).toBeInTheDocument()

    fireEvent.pointerLeave(control(), { pointerType: "touch" })
    expect(slider()).toBeInTheDocument()

    fireEvent.pointerLeave(control(), { pointerType: "mouse" })
    expect(querySlider()).not.toBeInTheDocument()
  })

  it("mutes on the first mouse click and opens the level control", () => {
    render(<VolumeControl />)

    fireEvent.click(trigger())

    expect(state.unlock).toHaveBeenCalledTimes(1)
    expect(state.toggleMute).toHaveBeenCalledTimes(1)
    expect(trigger()).toHaveAttribute("aria-expanded", "true")
    expect(slider()).toBeInTheDocument()
  })

  it("opens on the first touch press and mutes on the second", () => {
    render(<VolumeControl />)

    touchPress()
    expect(state.unlock).toHaveBeenCalledTimes(1)
    expect(state.toggleMute).not.toHaveBeenCalled()
    expect(slider()).toBeInTheDocument()

    touchPress()
    expect(state.unlock).toHaveBeenCalledTimes(2)
    expect(state.toggleMute).toHaveBeenCalledTimes(1)
  })

  it("opens on keyboard focus and toggles on keyboard activation", () => {
    render(<VolumeControl />)

    fireEvent.focus(trigger())
    expect(slider()).toBeInTheDocument()

    fireEvent.keyDown(trigger(), { key: "Enter" })
    fireEvent.click(trigger())
    fireEvent.keyUp(trigger(), { key: "Enter" })

    expect(state.unlock).toHaveBeenCalledTimes(1)
    expect(state.toggleMute).toHaveBeenCalledTimes(1)
  })

  it("closes after a pointer press outside the control", () => {
    render(
      <>
        <VolumeControl />
        <button type="button">Outside</button>
      </>,
    )
    fireEvent.focus(trigger())
    expect(slider()).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }))

    expect(querySlider()).not.toBeInTheDocument()
    expect(trigger()).toHaveAttribute("aria-expanded", "false")
  })

  it("stays open while the pointer travels from the trigger onto the slider", () => {
    render(<VolumeControl />)
    fireEvent.pointerEnter(control(), { pointerType: "mouse" })

    const panel = document.getElementById(
      trigger().getAttribute("aria-controls") ?? "",
    )
    expect(panel).toHaveClass("pr-1")
    expect(panel).toHaveClass("right-full")
    expect(panel?.className ?? "").not.toMatch(/\bmt-\d/)

    // Native pointerleave does not bubble; bubbling here would fake a leave of
    // the whole control, which is the opposite of travelling onto the slider.
    fireEvent.pointerLeave(trigger(), { pointerType: "mouse", bubbles: false })
    fireEvent.pointerEnter(slider(), { pointerType: "mouse" })

    expect(slider()).toBeInTheDocument()
  })

  it("stays open while the thumb is dragged outside the control", () => {
    render(<VolumeControl />)
    fireEvent.pointerEnter(control(), { pointerType: "mouse" })
    fireEvent.pointerDown(slider())
    fireEvent.pointerLeave(control(), { pointerType: "mouse" })

    expect(slider()).toBeInTheDocument()

    fireEvent.change(slider(), { target: { value: "0.35" } })
    expect(state.setVolume).toHaveBeenCalledWith(0.35)
  })

  it("slider hit target is at least 44px tall", () => {
    render(<VolumeControl />)
    fireEvent.focus(trigger())

    expect(slider()).toHaveClass("h-11")
  })

  it("reports a dragged level to the store", () => {
    render(<VolumeControl />)
    fireEvent.focus(trigger())

    fireEvent.change(slider(), { target: { value: "0.35" } })

    expect(state.setVolume).toHaveBeenCalledWith(0.35)
  })

  it("shows the slider at zero and offers unmute while muted", () => {
    state.muted = true
    state.volume = 0.6
    render(<VolumeControl />)
    fireEvent.focus(trigger())

    expect(slider()).toHaveValue("0")
    expect(trigger()).toHaveAccessibleName("common:sound.unmute")
  })
})
