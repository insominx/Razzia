import { formatResultDate } from "@razzia/web/features/poll/utils/format-date"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("formatResultDate", () => {
  it("joins the day and the time, each in the browser's own locale", () => {
    const day = vi
      .spyOn(Date.prototype, "toLocaleDateString")
      .mockReturnValue("08 Nov 2026")
    const time = vi
      .spyOn(Date.prototype, "toLocaleTimeString")
      .mockReturnValue("12:30")

    expect(formatResultDate("2026-11-08T12:30:00.000Z")).toBe(
      "08 Nov 2026 · 12:30",
    )
    // No locale is named, so the browser's own language is used.
    expect(day).toHaveBeenCalledWith(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    expect(time).toHaveBeenCalledWith([], {
      hour: "2-digit",
      minute: "2-digit",
    })
  })

  it("gives the year and the minutes of the moment it was given", () => {
    const iso = new Date(2026, 10, 8, 12, 34).toISOString()

    const [day, time] = formatResultDate(iso).split(" · ")

    expect(day).toContain("2026")
    expect(day).toContain("08")
    expect(time).toMatch(/12\D34/)
  })

  it("hands back what it was given when that is not a date", () => {
    expect(formatResultDate("not a date")).toBe("not a date")
    expect(formatResultDate("")).toBe("")
  })
})
