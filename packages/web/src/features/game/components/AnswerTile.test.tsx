import AnswerTile from "@razzia/web/features/game/components/AnswerTile"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

describe("AnswerTile", () => {
  afterEach(cleanup)

  it("is a letter block beside the words", () => {
    render(
      <AnswerTile index={2} state="active">
        Gamma
      </AnswerTile>,
    )

    const tile = document.querySelector("[data-answer-tile]")

    expect(tile).toHaveAttribute("data-answer", "C")
    expect(screen.getByText("Gamma")).toBeInTheDocument()
    // The letter belongs to the block, which is decoration for a screen reader.
    expect(tile?.querySelector(".rz-tile-block")).toHaveTextContent("C")
    expect(tile?.querySelector(".rz-tile-block")).toHaveAttribute(
      "aria-hidden",
      "true",
    )
  })

  it("takes its colour from the answer it stands for", () => {
    const { container } = render(
      <div>
        {[0, 1, 2, 3].map((index) => (
          <AnswerTile key={index} index={index} state="active">
            x
          </AnswerTile>
        ))}
      </div>,
    )

    const colours = [
      ...container.querySelectorAll<HTMLElement>("[data-answer-tile]"),
    ].map((tile) => tile.style.getPropertyValue("--c"))

    expect(colours).toEqual([
      "var(--rz-answer-a)",
      "var(--rz-answer-b)",
      "var(--rz-answer-c)",
      "var(--rz-answer-d)",
    ])
  })

  it("is a real button only when somebody can tap it", () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <AnswerTile index={0} state="active" onClick={onClick}>
        Tap
      </AnswerTile>,
    )

    fireEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledOnce()

    rerender(
      <AnswerTile index={0} state="active">
        Tap
      </AnswerTile>,
    )

    expect(screen.queryByRole("button")).toBeNull()
    expect(document.querySelector("[data-answer-tile]")?.tagName).toBe("DIV")
  })

  it("stays shut while it is only being revealed", () => {
    const onClick = vi.fn()

    render(
      <AnswerTile index={0} state="locked" onClick={onClick} disabled>
        Wait
      </AnswerTile>,
    )

    expect(screen.getByRole("button")).toBeDisabled()
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).not.toHaveBeenCalled()
    expect(document.querySelector("[data-answer-tile]")).toHaveAttribute(
      "data-state",
      "locked",
    )
  })

  it("puts a share in the block and on the rail", () => {
    render(
      <AnswerTile index={1} state="result" share={{ percent: 44, count: 8 }}>
        Beta
      </AnswerTile>,
    )

    const tile = document.querySelector("[data-answer-tile]")

    expect(tile).toHaveAttribute("data-share")
    expect(tile?.querySelector(".rz-tile-share")).toHaveTextContent("44%")
    expect(tile?.querySelector<HTMLElement>(".rz-tile-bar")?.style.width).toBe(
      "44%",
    )
  })

  it("carries a share-less tile without a rail", () => {
    render(
      <AnswerTile index={1} state="active">
        Beta
      </AnswerTile>,
    )

    expect(document.querySelector(".rz-tile-rail")).toBeNull()
    expect(document.querySelector(".rz-tile-share")).toBeNull()
    expect(document.querySelector("[data-answer-tile]")).not.toHaveAttribute(
      "data-share",
    )
  })

  it("marks only a correct tile with the badge", () => {
    const { rerender } = render(
      <AnswerTile index={0} state="correct">
        Right
      </AnswerTile>,
    )

    expect(screen.getByRole("img", { name: "Correct" })).toBeInTheDocument()

    rerender(
      <AnswerTile index={0} state="wrong">
        Right
      </AnswerTile>,
    )

    expect(screen.queryByRole("img")).toBeNull()
  })

  it("is the box a fit report holds to account for its words", () => {
    render(
      <AnswerTile index={0} state="active">
        Words
      </AnswerTile>,
    )

    expect(document.querySelector(".rz-tile-clip")).toHaveAttribute(
      "data-fit-box",
    )
  })
})
