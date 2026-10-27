import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import Result from "@razzia/web/features/game/components/states/Result"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// One play function across renders, as `use-sound` gives a real screen; a
// fresh one per render would refire the screen's effects forever.
const { sound } = vi.hoisted(() => ({
  sound: { play: vi.fn(), stop: vi.fn() },
}))

vi.mock("use-sound", () => ({
  default: () => [sound.play, { stop: sound.stop }],
}))

vi.mock("@razzia/web/features/game/hooks/use-sfx", () => ({
  useSfx: () => (classicPath: string) => classicPath,
}))

vi.mock("@razzia/web/features/game/utils/haptics", () => ({
  HAPTIC: { correct: "correct", wrong: "wrong" },
  haptic: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const result = (
  overrides: Partial<CommonStatusDataMap["SHOW_RESULT"]> = {},
): CommonStatusDataMap["SHOW_RESULT"] => ({
  correct: true,
  message: "game:correct",
  points: 850,
  myPoints: 850,
  rank: 1,
  aheadOfMe: null,
  ...overrides,
})

describe("Result", () => {
  afterEach(() => {
    cleanup()
  })

  it("tells a lecture's players what comes next", () => {
    render(<Result data={result({ note: "game:lectureNextQuestion" })} />)

    expect(screen.getByText("game:lectureNextQuestion")).toBeInTheDocument()
  })

  it("adds nothing in a normal game", () => {
    render(<Result data={result()} />)

    expect(screen.queryByText(/lecture/u)).not.toBeInTheDocument()
  })
})
