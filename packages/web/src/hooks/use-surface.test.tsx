import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

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

describe("useSurface", () => {
  beforeEach(() => {
    delete document.documentElement.dataset.surface
    delete document.documentElement.dataset.dialect
  })

  it("writes surface/dialect in a layout effect before paint cleanup thrash", async () => {
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

    expect(document.documentElement.dataset.surface).toBe("studio")
    expect(document.documentElement.dataset.dialect).toBe("stage-studio")

    rerender({ dialect: "dark-everywhere", surface: "studio" })

    // Must not clear attributes between dependency updates
    expect(document.documentElement.dataset.surface).toBe("studio")
    expect(document.documentElement.dataset.dialect).toBe("dark-everywhere")

    unmount()
    expect(document.documentElement.dataset.surface).toBeUndefined()
    expect(document.documentElement.dataset.dialect).toBeUndefined()
  })

  it("applies pathname-derived studio surface without override", async () => {
    const { useSurface } = await import("@razzia/web/hooks/use-surface")

    renderHook(() => useSurface(null))

    expect(document.documentElement.dataset.surface).toBe("studio")
    expect(document.documentElement.dataset.dialect).toBe("stage-studio")
  })
})
