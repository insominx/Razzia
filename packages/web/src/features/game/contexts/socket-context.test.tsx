import {
  SocketContext,
  type SocketContextValue,
  useEvent,
} from "@razzia/web/features/game/contexts/socket-context"
import { createFakeSocket } from "@razzia/web/features/rehearse/fake-socket"
import { act, cleanup, renderHook } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

const setup = () => {
  const fake = createFakeSocket()
  const on = vi.spyOn(fake.socket, "on")
  const off = vi.spyOn(fake.socket, "off")
  const value = {
    socket: fake.socket,
    isConnected: true,
    clientId: "test",
    connect: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
  } satisfies SocketContextValue
  const wrapper = ({ children }: PropsWithChildren) => (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  )

  return { fake, on, off, wrapper }
}

describe("useEvent", () => {
  afterEach(() => {
    cleanup()
  })

  it("passes the server's arguments to the callback", () => {
    const { fake, wrapper } = setup()
    const callback = vi.fn()

    renderHook(
      () => {
        useEvent("game:totalPlayers", callback)
      },
      { wrapper },
    )
    act(() => {
      fake.deliver("game:totalPlayers", 7)
    })

    expect(callback).toHaveBeenCalledWith(7)
  })

  it("subscribes once however often the screen renders", () => {
    const { on, off, wrapper } = setup()
    const { rerender } = renderHook(
      ({ callback }) => {
        useEvent("game:totalPlayers", callback)
      },
      { wrapper, initialProps: { callback: vi.fn() } },
    )

    rerender({ callback: vi.fn() })
    rerender({ callback: vi.fn() })

    expect(on).toHaveBeenCalledTimes(1)
    expect(off).not.toHaveBeenCalled()
  })

  it("calls the callback of the render that was last committed", () => {
    const { fake, wrapper } = setup()
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ callback }) => {
        useEvent("game:totalPlayers", callback)
      },
      { wrapper, initialProps: { callback: first } },
    )

    rerender({ callback: second })
    act(() => {
      fake.deliver("game:totalPlayers", 3)
    })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(3)
  })

  it("unsubscribes when the screen goes, and follows a change of event", () => {
    const { fake, wrapper } = setup()
    const callback = vi.fn()
    const { rerender, unmount } = renderHook(
      ({ event }) => {
        useEvent(event, callback)
      },
      {
        wrapper,
        initialProps: {
          event: "game:totalPlayers" as "game:totalPlayers" | "game:cooldown",
        },
      },
    )

    rerender({ event: "game:cooldown" })
    act(() => {
      fake.deliver("game:totalPlayers", 1)
      fake.deliver("game:cooldown", 2)
    })
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(2)

    unmount()
    act(() => {
      fake.deliver("game:cooldown", 3)
    })
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
