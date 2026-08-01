import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  isLightRegister,
  resolveRegister,
} from "@razzia/web/hooks/use-surface"

vi.mock("@tanstack/react-router", () => ({
  useRouterState: (
    opts: { select: (state: { location: { pathname: string } }) => unknown },
  ) => opts.select({ location: { pathname: "/manager/config" } }),
}))

vi.mock("@razzia/web/features/game/stores/manager", () => ({
  useManagerStore: (
    selector: (state: {
      config?: { game: { visuals?: { dialect?: string } } }
    }) => unknown,
  ) =>
    selector({
      config: { game: { visuals: { dialect: "stage-studio" } } },
    }),
}))

describe("resolveRegister", () => {
  it("is light only for stage-studio studio", () => {
    expect(isLightRegister("stage-studio", "studio")).toBe(true)
    expect(resolveRegister("stage-studio", "studio")).toBe("light")
    expect(resolveRegister("stage-studio", "stage")).toBe("dark")
    expect(resolveRegister("dark-everywhere", "studio")).toBe("dark")
  })
})

describe("useSurface", () => {
  beforeEach(() => {
    delete document.documentElement.dataset.register
    delete document.documentElement.dataset.surface
    delete document.documentElement.dataset.dialect
  })

  it("writes a single data-register attr and keeps it across updates", async () => {
    const { useSurface } = await import("@razzia/web/hooks/use-surface")

    type Props = {
      dialect: "dark-everywhere" | "stage-studio"
      surface: "stage" | "studio"
    }
    const initialProps: Props = {
      dialect: "stage-studio",
      surface: "studio",
    }

    const { rerender, unmount } = renderHook(
      ({ dialect, surface }: Props) => useSurface({ dialect, surface }),
      { initialProps },
    )

    expect(document.documentElement.dataset.register).toBe("light")

    rerender({ dialect: "dark-everywhere", surface: "studio" })
    expect(document.documentElement.dataset.register).toBe("dark")

    unmount()
    expect(document.documentElement.dataset.register).toBeUndefined()
  })
})
