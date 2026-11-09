import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// The page turns its own fills clear under `data-backdrop="slide"` so the
// deck's slide shows through. A poll's frame has a fill of its own (`bg-canvas`
// on a fixed layer), which is not among the page's, so it is named in the same
// rule. jsdom does no layout, so the rule itself is what is checked here; a
// real browser shows the result in the deck's end-to-end run.

const css = readFileSync(
  resolve(import.meta.dirname, "../../index.css"),
  "utf-8",
)

const ruleFor = (selector: string) => {
  const rules = css.match(/[^{}]+\{[^{}]*\}/gu) ?? []

  return rules.find((rule) => rule.split("{")[0].includes(selector))
}

describe("the slide backdrop rule", () => {
  it("clears the page, the app root, the show's backdrop and the poll frame together", () => {
    const rule = ruleFor('html[data-backdrop="slide"] [data-poll-frame]')

    expect(rule).toBeDefined()

    const [selectors, body] = (rule ?? "").split("{")

    for (const selector of [
      'html[data-backdrop="slide"]',
      'html[data-backdrop="slide"] body',
      'html[data-backdrop="slide"] [data-app-root]',
      'html[data-backdrop="slide"] .rz-backdrop',
      'html[data-backdrop="slide"] [data-poll-frame]',
    ]) {
      expect(selectors).toContain(selector)
    }

    expect(body).toMatch(/background:\s*transparent/u)
  })
})
