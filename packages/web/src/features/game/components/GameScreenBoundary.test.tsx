import GameScreenBoundary from "@razzia/web/features/game/components/GameScreenBoundary"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const Boom = ({ explode }: { explode: boolean }) => {
  if (explode) {
    throw new Error("bad payload")
  }

  return <p>screen</p>
}

describe("GameScreenBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("keeps a throwing screen from escaping and asks for the state again", () => {
    const onRecover = vi.fn()

    render(
      <GameScreenBoundary resetKey="a" onRecover={onRecover}>
        <Boom explode />
      </GameScreenBoundary>,
    )

    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(onRecover).toHaveBeenCalledTimes(1)
  })

  it("tries the screen again when the reset key changes", () => {
    const { rerender } = render(
      <GameScreenBoundary resetKey="a" onRecover={vi.fn()}>
        <Boom explode />
      </GameScreenBoundary>,
    )

    rerender(
      <GameScreenBoundary resetKey="b" onRecover={vi.fn()}>
        <Boom explode={false} />
      </GameScreenBoundary>,
    )

    expect(screen.getByText("screen")).toBeInTheDocument()
  })
})
