import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Answers from "@razzia/web/features/game/components/states/Answers"

const answerStyles = readFileSync(
  resolve(process.cwd(), "src/index.css"),
  "utf8",
)

const mocks = vi.hoisted(() => ({
  socketEmit: vi.fn(),
  pop: vi.fn(),
  playMusic: vi.fn(),
  stopMusic: vi.fn(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: mocks.socketEmit } }),
  useEvent: vi.fn(),
}))

vi.mock("@razzia/web/features/game/stores/player", () => ({
  usePlayerStore: () => ({
    player: { username: "Player" },
    gameId: "game-1",
  }),
}))

vi.mock("@razzia/web/features/game/hooks/use-sfx", () => ({
  useSfx: () => (path: string) => path,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("use-sound", () => ({
  default: (path: string) =>
    path.includes("answersMusic")
      ? [mocks.playMusic, { stop: mocks.stopMusic }]
      : [mocks.pop, { stop: vi.fn() }],
}))

vi.mock("@razzia/web/features/game/components/DotField", () => ({
  default: () => null,
}))

const makeData = (
  overrides: Partial<CommonStatusDataMap["SELECT_ANSWER"]> = {},
): CommonStatusDataMap["SELECT_ANSWER"] => ({
  question: "Question",
  questionNumber: 7,
  answers: ["First", "Second"],
  time: 10,
  totalPlayer: 2,
  revealStartedAt: 1_000,
  unlockAt: 5_000,
  serverNow: 1_000,
  answeringOpen: false,
  ...overrides,
})

describe("Answers reveal lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2040-01-01T00:00:00.000Z"))
    vi.clearAllMocks()
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("starts with a visible tight glow and blooms it over 300ms", () => {
    expect(answerStyles).toMatch(
      /\.rz-answer-hover-glow\s*\{[^}]*border:\s*3px solid currentColor;[^}]*opacity:\s*0;[^}]*filter:\s*blur\(0px\);[^}]*filter 300ms ease-out/s,
    )
    expect(answerStyles).toMatch(
      /data-hover-effect="glow"[^}]*>\s*\.rz-answer-hover-glow\s*\{[^}]*opacity:\s*0\.72;[^}]*filter:\s*blur\(18px\);/s,
    )
    expect(answerStyles).toMatch(
      /data-hover-effect="glow"[^}]*>\s*\.rz-answer-hover-glow\s*\{[^}]*transition:[^}]*opacity 0s/s,
    )
    expect(answerStyles).not.toContain("rz-answer-glow-in")
  })

  it("reserves every slot while keeping reveal, HUD, music, and submit closed", async () => {
    const { rerender } = render(<Answers data={makeData()} />)
    const answerButtons = screen.getAllByRole("button")

    expect(answerButtons).toHaveLength(2)
    expect(answerButtons[0]).toBeDisabled()
    expect(answerButtons[1]).toBeDisabled()
    expect(answerButtons[0]).not.toHaveClass("rz-answer-slot-visible")
    expect(
      document.querySelector('[data-question-layout="game-question"]'),
    ).toHaveClass("w-full", "px-6", "py-8", "md:px-10", "md:py-10")
    expect(
      document.querySelector('[data-question-layout="game-question"]'),
    ).not.toHaveClass("max-w-4xl")
    expect(
      document.querySelector(
        '[data-question-number-layout="game-question-number"]',
      ),
    ).toHaveAttribute("data-question-number-phase", "settled")
    expect(
      answerButtons[0]?.parentElement?.style.getPropertyValue(
        "--rz-answer-reveal-fade",
      ),
    ).toBe("2000ms")
    expect(screen.getByText("game:hud.time").parentElement).toHaveClass(
      "invisible",
    )
    expect(mocks.playMusic).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(answerButtons[0]).not.toHaveClass("rz-answer-slot-visible")
    await act(() => vi.advanceTimersByTimeAsync(999))
    expect(answerButtons[0]).not.toHaveClass("rz-answer-slot-visible")
    await act(() => vi.advanceTimersByTimeAsync(1))
    const firstSurface = answerButtons[0].querySelector("[data-answer-surface]")

    expect(answerButtons[0]).toHaveClass("rz-answer-slot-visible")
    expect(answerButtons[0]).toHaveAttribute("data-answer-state", "revealing")
    expect(answerButtons[0]).toHaveAttribute("data-hover-effect", "none")
    expect(answerButtons[0]).not.toHaveClass("hover:-translate-y-0.5")
    expect(
      answerButtons[0].querySelector("[data-answer-hover-glow]"),
    ).not.toBeInTheDocument()
    expect(firstSurface).toHaveAttribute("data-answer-surface-state", "locked")
    expect(firstSurface).toHaveAttribute(
      "data-answer-surface-effect",
      "blurred",
    )
    expect(firstSurface).toHaveClass("border-answer-a", "bg-answer-a-tint")
    expect(firstSurface).not.toContainElement(screen.getByText("First"))
    expect(screen.getByText("First")).toHaveClass("text-text-primary")
    expect(answerButtons[0]).toBeDisabled()
    fireEvent.click(answerButtons[0])
    expect(mocks.socketEmit).not.toHaveBeenCalled()

    rerender(
      <Answers data={makeData({ answeringOpen: true, serverNow: 5_000 })} />,
    )

    expect(answerButtons[0]).toBeEnabled()
    expect(answerButtons[1]).toBeEnabled()
    expect(answerButtons[1]).toHaveClass("rz-answer-slot-visible")
    expect(answerButtons[0]).toHaveAttribute("data-answer-state", "active")
    expect(answerButtons[1]).toHaveAttribute("data-answer-state", "active")
    expect(answerButtons[0]).toHaveAttribute("data-hover-effect", "glow")
    expect(answerButtons[1]).toHaveAttribute("data-hover-effect", "glow")
    expect(
      answerButtons[0].querySelector("[data-answer-hover-glow]"),
    ).toBeInTheDocument()
    expect(answerButtons[0]).not.toHaveClass("hover:-translate-y-0.5")
    expect(firstSurface).toHaveAttribute("data-answer-surface-state", "active")
    expect(firstSurface).toHaveAttribute("data-answer-surface-effect", "flash")
    expect(screen.getByText("game:hud.time").parentElement).not.toHaveClass(
      "invisible",
    )
    expect(mocks.playMusic).toHaveBeenCalledTimes(1)

    fireEvent.click(answerButtons[1])
    expect(mocks.socketEmit).toHaveBeenCalledWith("player:selectedAnswer", {
      gameId: "game-1",
      data: { answerKey: 1 },
    })
  })

  it("keeps untimed HUD absent and suppresses music for audio/video", () => {
    render(
      <Answers
        data={makeData({
          time: -1,
          answeringOpen: true,
          media: { type: "audio", url: "/question.mp3" },
        })}
      />,
    )

    expect(screen.queryByText("game:hud.time")).not.toBeInTheDocument()
    expect(mocks.playMusic).not.toHaveBeenCalled()
    expect(screen.getAllByRole("button")).toHaveLength(2)
  })

  it("shows all reduced-motion slots but leaves them disabled before unlock", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )

    render(<Answers data={makeData()} />)

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveClass("rz-answer-slot-visible")
      expect(button).toBeDisabled()
    }
    expect(mocks.playMusic).not.toHaveBeenCalled()
  })
})
