import PollBars from "@razzia/web/features/poll/components/PollBars"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(cleanup)

describe("PollBars while the poll is sealed", () => {
  it("lists the options and nothing about how they are doing", () => {
    const { container } = render(
      <PollBars options={["Pizza", "Soup"]} counts={[3, 1]} total={4} sealed />,
    )

    expect(container.querySelectorAll("[data-poll-option]")).toHaveLength(2)
    expect(container.textContent).toContain("Pizza")
    expect(container.textContent).toContain("Soup")
    expect(container.querySelector("[data-poll-count]")).toBeNull()
    expect(container.querySelector('[style*="width"]')).toBeNull()
    // The letters A and B are the only marks beside the words.
    expect(container.textContent).not.toMatch(/\d/u)
  })

  it("draws the counts, shares and bars once it is not sealed", () => {
    const { container } = render(
      <PollBars options={["Pizza", "Soup"]} counts={[3, 1]} total={4} />,
    )

    expect(
      [...container.querySelectorAll("[data-poll-count]")].map(
        (count) => count.textContent,
      ),
    ).toEqual(["375%", "125%"])
    expect(container.querySelectorAll('[style*="width"]')).toHaveLength(2)
  })
})
