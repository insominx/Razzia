import { EVENTS } from "@razzia/common/constants"
import ConfigVisuals from "@razzia/web/features/manager/components/configurations/ConfigVisuals"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Ack = (error: Error | null, response?: unknown) => void

const mocks = vi.hoisted(() => ({
  timeoutEmit: vi.fn(),
  timeout: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  connected: true,
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({
    socket: { emit: vi.fn(), timeout: mocks.timeout },
    isConnected: mocks.connected,
    clientId: "client",
  }),
}))

vi.mock("@razzia/web/features/manager/contexts/config-context", () => ({
  useConfig: () => ({
    game: {
      visuals: { background: { kind: "upload", path: "bg.png" } },
      resolvedVisuals: { backgroundUrl: "/bg.png" },
    },
  }),
}))

vi.mock("@razzia/web/features/visuals/use-background-upload", () => ({
  useBackgroundUpload: () => ({ uploading: false, uploadFile: vi.fn() }),
}))

vi.mock("react-hot-toast", () => ({
  default: { success: mocks.success, error: mocks.error },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Dialect (2), show intensity (3), sound theme (3), in page order.
const radios = () => screen.getAllByRole<HTMLButtonElement>("radio")
const clearButton = () =>
  screen.getByRole<HTMLButtonElement>("button", {
    name: "manager:visuals.clear",
  })

const lastCall = () => mocks.timeoutEmit.mock.calls.at(-1) as unknown[]
const ackOf = (call: unknown[]) => call.at(-1) as Ack

describe("ConfigVisuals settings", () => {
  beforeEach(() => {
    mocks.connected = true
    mocks.timeout.mockReturnValue({ emit: mocks.timeoutEmit })
  })

  afterEach(() => {
    cleanup()
    mocks.timeoutEmit.mockReset()
    mocks.timeout.mockReset()
    mocks.success.mockReset()
    mocks.error.mockReset()
  })

  it("sends a change with a timeout and locks its group until the answer", () => {
    render(<ConfigVisuals />)

    fireEvent.click(radios()[1])

    expect(mocks.timeout).toHaveBeenCalledWith(5_000)
    expect(lastCall().slice(0, 2)).toEqual([
      EVENTS.MANAGER.DIALECT_SET,
      { dialect: "stage-studio" },
    ])
    expect(radios()[0].disabled).toBe(true)
    expect(radios()[1].disabled).toBe(true)
    expect(radios()[2].disabled).toBe(false)

    act(() => ackOf(lastCall())(null, { ok: true }))

    expect(radios()[0].disabled).toBe(false)
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it.each([
    [1, EVENTS.MANAGER.DIALECT_SET, "errors:visuals.dialectSetFailed"],
    [
      3,
      EVENTS.MANAGER.SHOW_INTENSITY_SET,
      "errors:visuals.showIntensitySetFailed",
    ],
    [7, EVENTS.MANAGER.SOUND_THEME_SET, "errors:visuals.soundThemeSetFailed"],
  ])(
    "frees radio %i and toasts when the answer never comes",
    (index, event, key) => {
      render(<ConfigVisuals />)

      fireEvent.click(radios()[index])
      expect(lastCall()[0]).toBe(event)
      expect(radios()[index].disabled).toBe(true)

      act(() => ackOf(lastCall())(new Error("operation has timed out")))

      expect(radios().every((radio) => !radio.disabled)).toBe(true)
      expect(mocks.error).toHaveBeenCalledWith(key)
    },
  )

  it("toasts the server's error key and frees the group", () => {
    render(<ConfigVisuals />)

    fireEvent.click(radios()[1])
    act(() =>
      ackOf(lastCall())(null, { error: "errors:visuals.dialectSetFailed" }),
    )

    expect(mocks.error).toHaveBeenCalledWith("errors:visuals.dialectSetFailed")
    expect(radios().every((radio) => !radio.disabled)).toBe(true)
  })

  it("frees the clear button on a timeout and toasts the failure", () => {
    render(<ConfigVisuals />)

    expect(clearButton().disabled).toBe(false)
    fireEvent.click(clearButton())
    expect(lastCall()[0]).toBe(EVENTS.MANAGER.GLOBAL_BACKGROUND_CLEAR)
    expect(clearButton().disabled).toBe(true)

    act(() => ackOf(lastCall())(new Error("operation has timed out")))

    expect(clearButton().disabled).toBe(false)
    expect(mocks.error).toHaveBeenCalledWith(
      "errors:visuals.backgroundClearFailed",
    )
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it("toasts success for a cleared background only on { ok: true }", () => {
    render(<ConfigVisuals />)

    fireEvent.click(clearButton())
    expect(mocks.success).not.toHaveBeenCalled()

    act(() => ackOf(lastCall())(null, { ok: true }))

    expect(mocks.success).toHaveBeenCalledWith("manager:visuals.cleared")
  })

  it("clears every pending state when the connection drops", () => {
    const { rerender } = render(<ConfigVisuals />)

    fireEvent.click(radios()[1])
    fireEvent.click(radios()[3])
    fireEvent.click(radios()[7])
    fireEvent.click(clearButton())
    expect(radios().filter((radio) => radio.disabled)).toHaveLength(8)
    expect(clearButton().disabled).toBe(true)

    mocks.connected = false
    rerender(<ConfigVisuals />)

    expect(radios().every((radio) => !radio.disabled)).toBe(true)
    expect(clearButton().disabled).toBe(false)
  })

  it("does not let an answer from a dropped connection free a newer request", () => {
    const { rerender } = render(<ConfigVisuals />)

    fireEvent.click(radios()[1])
    const staleCall = lastCall()

    mocks.connected = false
    rerender(<ConfigVisuals />)
    mocks.connected = true
    rerender(<ConfigVisuals />)

    fireEvent.click(radios()[1])
    expect(radios()[1].disabled).toBe(true)

    act(() => ackOf(staleCall)(new Error("operation has timed out")))

    expect(radios()[1].disabled).toBe(true)

    act(() => ackOf(lastCall())(null, { ok: true }))

    expect(radios()[1].disabled).toBe(false)
  })
})
