import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import Standing from "@razzia/web/features/game/components/states/Standing"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

type Data = CommonStatusDataMap["SHOW_STANDING"]

const base: Data = {
  rank: 6,
  previousRank: 9,
  points: 4_200,
  gained: 850,
  total: 14,
  ladder: [
    { rank: 1, username: "Ada", points: 9_000, me: false },
    { rank: 5, username: "Lin", points: 4_900, me: false },
    { rank: 6, username: "Me", points: 4_200, me: true },
    { rank: 7, username: "Raj", points: 3_800, me: false },
  ],
  behind: { username: "Lin", points: 700 },
}

describe("Standing", () => {
  afterEach(() => {
    cleanup()
  })

  it("keeps every row when neighbours are level on a place", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const level = (username: string, me = false) => ({
      rank: 1,
      username,
      points: 500,
      me,
    })
    const { container, rerender } = render(
      <Standing
        data={{
          ...base,
          rank: 1,
          ladder: [level("Ada"), level("Me", true), level("Lin"), level("Raj")],
        }}
      />,
    )

    rerender(
      <Standing
        data={{
          ...base,
          rank: 1,
          ladder: [level("Ada"), level("Me", true), level("Lin")],
        }}
      />,
    )

    expect(container.querySelectorAll("[data-standing-row]")).toHaveLength(3)
    expect(
      container.querySelector('[data-standing-row="me"]')?.textContent,
    ).toContain("Me")
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it("shows the player's own place and who is around it", () => {
    const { container } = render(<Standing data={base} />)

    expect(container.querySelectorAll("[data-standing-row]")).toHaveLength(4)
    expect(
      container.querySelector('[data-standing-row="me"]')?.textContent,
    ).toContain("Me")
    expect(
      container.querySelector('[data-standing-row="me"]')?.textContent,
    ).toContain("4,200")
  })

  it("says how many places were gained", () => {
    const { container } = render(<Standing data={base} />)
    const move = container.querySelector("[data-standing-move]")

    expect(move?.getAttribute("data-standing-move")).toBe("up")
    expect(move?.textContent).toBe('game:standingUp:{"count":3}')
  })

  it("says how many places were lost", () => {
    const { container } = render(
      <Standing data={{ ...base, rank: 9, previousRank: 6 }} />,
    )
    const move = container.querySelector("[data-standing-move]")

    expect(move?.getAttribute("data-standing-move")).toBe("down")
    expect(move?.textContent).toBe('game:standingDown:{"count":3}')
  })

  it("says nothing about movement when the place did not change or is new", () => {
    const same = render(<Standing data={{ ...base, previousRank: 6 }} />)

    expect(same.container.querySelector("[data-standing-move]")).toBeNull()
    cleanup()

    const first = render(<Standing data={{ ...base, previousRank: null }} />)

    expect(first.container.querySelector("[data-standing-move]")).toBeNull()
  })

  it("names the gap to the player in front", () => {
    const { container } = render(<Standing data={base} />)

    expect(container.querySelector("[data-standing-line]")?.textContent).toBe(
      'game:standingGap:{"points":"700","name":"Lin"}',
    )
  })

  it("calls a tie a tie, not a gap of nothing", () => {
    const { container } = render(
      <Standing data={{ ...base, behind: { username: "Lin", points: 0 } }} />,
    )

    expect(container.querySelector("[data-standing-line]")?.textContent).toBe(
      'game:standingLevel:{"name":"Lin"}',
    )
  })

  it("congratulates the leader instead", () => {
    const { container } = render(
      <Standing
        data={{
          ...base,
          rank: 1,
          previousRank: 1,
          behind: null,
          ladder: [
            { rank: 1, username: "Me", points: 4_200, me: true },
            { rank: 2, username: "Lin", points: 3_900, me: false },
          ],
        }}
      />,
    )

    expect(container.querySelector("[data-standing-line]")?.textContent).toBe(
      "game:standingLeader",
    )
  })
})
