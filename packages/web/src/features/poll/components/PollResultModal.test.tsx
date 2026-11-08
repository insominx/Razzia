import type { PollResultRecord } from "@razzia/common/types/poll"
import PollResultModal from "@razzia/web/features/poll/components/PollResultModal"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

const record: PollResultRecord = {
  id: "r1",
  pollId: "lunch",
  question: "What should we eat?",
  options: ["Pizza", "Soup", "Salad"],
  anonymous: true,
  date: "2026-11-08T12:30:00.000Z",
  gameSubject: "Lecture 4",
  counts: [7, 3, 2],
  total: 12,
}

afterEach(() => {
  cleanup()
  document.body.style.overflow = ""
})

describe("PollResultModal", () => {
  it("shows the question, where and when it was asked, and how many voted", () => {
    render(<PollResultModal result={record} onClose={vi.fn()} />)

    const dialog = screen.getByRole("dialog")

    expect(dialog).toHaveAccessibleName("What should we eat?")
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(dialog).toHaveTextContent(
      'poll:result.subject:{"subject":"Lecture 4"}',
    )
    expect(dialog).toHaveTextContent('manager:polls.resultVotes:{"count":12}')
  })

  it("shows each option's votes and share", () => {
    render(<PollResultModal result={record} onClose={vi.fn()} />)

    expect(
      [...document.querySelectorAll("[data-poll-count]")].map(
        (count) => count.textContent,
      ),
    ).toEqual(["758%", "325%", "217%"])
  })

  it("says whether the poll was anonymous", () => {
    const { rerender } = render(
      <PollResultModal result={record} onClose={vi.fn()} />,
    )
    expect(screen.getByText("poll:privacy.anonymous")).toBeInTheDocument()

    rerender(
      <PollResultModal
        result={{ ...record, anonymous: false }}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText("poll:privacy.named")).toBeInTheDocument()
  })

  it("explains a poll the room closed on, and only then", () => {
    const { rerender } = render(
      <PollResultModal result={record} onClose={vi.fn()} />,
    )
    expect(document.querySelector("[data-partial-note]")).toBeNull()

    rerender(
      <PollResultModal
        result={{ ...record, partial: true }}
        onClose={vi.fn()}
      />,
    )
    expect(document.querySelector("[data-partial-note]")).toHaveTextContent(
      "poll:result.partialNote",
    )
  })

  it("lists every voter of a named poll, not only the first few", () => {
    const voters = Array.from({ length: 20 }, (_, i) => ({
      username: `Student ${String(i).padStart(2, "0")}`,
      option: 0,
    }))

    render(
      <PollResultModal
        result={{
          ...record,
          anonymous: false,
          counts: [20, 0, 0],
          total: 20,
          voters,
        }}
        onClose={vi.fn()}
      />,
    )

    const names = document.querySelector("[data-poll-names]")

    expect(names).toHaveTextContent("Student 00")
    expect(names).toHaveTextContent("Student 19")
    expect(names?.textContent).not.toContain("poll:more")
  })

  it("closes with its button and with Escape, once each", () => {
    const onClose = vi.fn()
    render(<PollResultModal result={record} onClose={onClose} />)

    fireEvent.click(screen.getByRole("button", { name: "poll:result.close" }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(document, { key: "Enter" })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it("holds the page still while it is open and lets go when it closes", () => {
    const { unmount } = render(
      <PollResultModal result={record} onClose={vi.fn()} />,
    )

    expect(document.body.style.overflow).toBe("hidden")
    expect(screen.getByRole("dialog")).toHaveFocus()

    unmount()

    expect(document.body.style.overflow).toBe("")
  })

  it("does not restart when its caller hands it a new close function", () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(
      <PollResultModal result={record} onClose={first} />,
    )

    rerender(<PollResultModal result={record} onClose={second} />)
    fireEvent.keyDown(document, { key: "Escape" })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
