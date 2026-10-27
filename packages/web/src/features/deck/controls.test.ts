import { describe, expect, it } from "vitest"
import { parseDeckCommand } from "@razzia/web/features/deck/protocol"

const command = (body: object) => ({ source: "cst426-deck", v: 1, ...body })

describe("deck controls command", () => {
  it("parses shown true and false", () => {
    expect(
      parseDeckCommand(command({ type: "controls", shown: true })),
    ).toEqual(command({ type: "controls", shown: true }))
    expect(
      parseDeckCommand(command({ type: "controls", shown: false })),
    ).toEqual(command({ type: "controls", shown: false }))
  })

  it("refuses a controls command without a boolean", () => {
    expect(parseDeckCommand(command({ type: "controls" }))).toBeNull()
    expect(
      parseDeckCommand(command({ type: "controls", shown: "yes" })),
    ).toBeNull()
  })
})
