import type { Socket } from "@razzia/common/types/game/socket"
import { EVENTS } from "@razzia/common/constants"
import { describe, expect, it, vi } from "vitest"

// The many tests that replace `services/config` give it a fixed list of
// exports and nothing else. The host's config must still arrive, with an
// empty list of polls, rather than fail because the poll folder cannot be
// read through that replacement.
vi.mock("@razzia/socket/services/config", () => ({
  getGameConfig: () => ({ visuals: {} }),
  getQuizzMeta: () => [{ id: "q", subject: "Quiz" }],
  getResultsMeta: () => [],
}))

vi.mock("@razzia/socket/services/visuals", () => ({
  resolveVisuals: () => ({}),
}))

describe("emitConfig with polls", () => {
  it("sends the config with no polls when the poll folder cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const emit = vi.fn()
    const { emitConfig } = await import("@razzia/socket/services/manager")

    emitConfig({ emit } as unknown as Socket)

    expect(emit).toHaveBeenCalledWith(
      EVENTS.MANAGER.CONFIG,
      expect.objectContaining({
        quizz: [{ id: "q", subject: "Quiz" }],
        polls: [],
      }),
    )
  })
})
