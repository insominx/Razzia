import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const uploadBackgroundViaHttp = vi.fn()
const toastError = vi.fn()
const toastSuccess = vi.fn()

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ clientId: "client-1" }),
}))

vi.mock("@razzia/web/features/visuals/background-upload", async () => {
  const actual = await vi.importActual<
    typeof import("@razzia/web/features/visuals/background-upload")
  >("@razzia/web/features/visuals/background-upload")

  return {
    ...actual,
    uploadBackgroundViaHttp: (...args: unknown[]) =>
      uploadBackgroundViaHttp(...args),
  }
})

vi.mock("react-hot-toast", () => ({
  default: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("useBackgroundUpload", () => {
  beforeEach(() => {
    uploadBackgroundViaHttp.mockReset()
    toastError.mockReset()
    toastSuccess.mockReset()
  })

  it("uploads once while uploading and ignores a second concurrent pick", async () => {
    let resolveUpload!: (value: unknown) => void
    uploadBackgroundViaHttp.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve
        }),
    )

    const onSuccess = vi.fn()
    const { useBackgroundUpload } = await import(
      "@razzia/web/features/visuals/use-background-upload"
    )
    const { result } = renderHook(() =>
      useBackgroundUpload({ setGlobal: true, onSuccess }),
    )

    const file = new File(["ok"], "a.png", { type: "image/png" })

    await act(async () => {
      void result.current.uploadFile(file)
    })

    expect(result.current.uploading).toBe(true)

    await act(async () => {
      void result.current.uploadFile(file)
    })

    expect(uploadBackgroundViaHttp).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveUpload({
        ref: { kind: "config-asset", path: "a.png" },
        url: "/config-assets/backgrounds/a.png",
      })
    })

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(result.current.uploading).toBe(false)
  })
})
