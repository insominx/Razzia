import { EVENTS } from "@razzia/common/constants"
import { usePollLane } from "@razzia/web/features/poll/hooks/use-poll-lane"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  socket: { emit: vi.fn() },
  handlers: new Map<string, (_payload?: unknown) => void>(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: mocks.socket }),
  useEvent: (event: string, handler: (_payload?: unknown) => void) => {
    mocks.handlers.set(event, handler)
  },
}))

const Probe = () => {
  usePollLane(null)

  return null
}

describe("usePollLane and the room's player count", () => {
  beforeEach(() => {
    mocks.handlers.clear()
    usePollStore.getState().reset()
  })

  afterEach(cleanup)

  it("keeps the latest total the room announces", () => {
    render(<Probe />)

    mocks.handlers.get(EVENTS.GAME.TOTAL_PLAYERS)?.(12)
    expect(usePollStore.getState().playerTotal).toBe(12)

    mocks.handlers.get(EVENTS.GAME.TOTAL_PLAYERS)?.(13)
    expect(usePollStore.getState().playerTotal).toBe(13)
  })
})
