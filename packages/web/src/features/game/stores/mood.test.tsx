import { STATUS } from "@razzia/common/types/game/status"
import {
  BEAM_MOODS,
  moodForStatus,
  useMoodOverride,
  useMoodStore,
} from "@razzia/web/features/game/stores/mood"
import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

describe("moodForStatus", () => {
  it("opens the show in teal, plays it cool, and ends it gold", () => {
    expect(moodForStatus(STATUS.SHOW_ROOM)).toBe("teal")
    expect(moodForStatus(STATUS.SHOW_START)).toBe("teal")
    expect(moodForStatus(STATUS.SHOW_QUESTION)).toBe("cool")
    expect(moodForStatus(STATUS.SELECT_ANSWER)).toBe("cool")
    expect(moodForStatus(STATUS.SHOW_RESPONSES)).toBe("cool")
    expect(moodForStatus(STATUS.SHOW_LEADERBOARD)).toBe("cool")
    expect(moodForStatus(STATUS.FINISHED)).toBe("gold")
  })

  it("has a mood before there is a status", () => {
    expect(moodForStatus(undefined)).toBe("cool")
  })

  it("lights beams only for the opening and the finale", () => {
    expect(BEAM_MOODS).toEqual(["teal", "gold"])
  })
})

describe("useMoodOverride", () => {
  afterEach(() => {
    useMoodStore.getState().setOverride(null)
  })

  it("holds a mood while its screen is up, then lets go", () => {
    const { unmount } = renderHook(() => useMoodOverride("warm"))

    expect(useMoodStore.getState().override).toBe("warm")

    unmount()
    expect(useMoodStore.getState().override).toBeNull()
  })

  it("follows a screen that changes its mind", () => {
    const { rerender } = renderHook(
      ({ mood }: { mood: "warm" | null }) => useMoodOverride(mood),
      { initialProps: { mood: null as "warm" | null } },
    )

    expect(useMoodStore.getState().override).toBeNull()

    rerender({ mood: "warm" })
    expect(useMoodStore.getState().override).toBe("warm")

    rerender({ mood: null })
    expect(useMoodStore.getState().override).toBeNull()
  })
})
