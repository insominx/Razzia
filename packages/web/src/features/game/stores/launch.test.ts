import { useLaunchStore } from "@razzia/web/features/game/stores/launch"
import { beforeEach, describe, expect, it } from "vitest"

describe("launch store", () => {
  beforeEach(() => {
    useLaunchStore.setState({ armed: false })
  })

  it("gives GO to nobody until the countdown has run", () => {
    expect(useLaunchStore.getState().consume()).toBe(false)
  })

  it("gives GO to exactly one card after the countdown", () => {
    useLaunchStore.getState().arm()

    expect(useLaunchStore.getState().consume()).toBe(true)
    expect(useLaunchStore.getState().consume()).toBe(false)
  })
})
