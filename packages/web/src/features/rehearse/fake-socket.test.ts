import { createFakeSocket } from "@razzia/web/features/rehearse/fake-socket"
import { describe, expect, it, vi } from "vitest"

describe("createFakeSocket", () => {
  it("delivers server events to the screens that subscribed", () => {
    const fake = createFakeSocket()
    const cooldown = vi.fn()

    fake.socket.on("game:cooldown", cooldown)
    fake.deliver("game:cooldown", 7)
    fake.deliver("game:playerAnswer", 3)

    expect(cooldown).toHaveBeenCalledOnce()
    expect(cooldown).toHaveBeenCalledWith(7)
  })

  it("stops delivering after off, for one listener or for the event", () => {
    const fake = createFakeSocket()
    const first = vi.fn()
    const second = vi.fn()

    fake.socket.on("game:cooldown", first)
    fake.socket.on("game:cooldown", second)
    fake.socket.off("game:cooldown", first)
    fake.deliver("game:cooldown", 1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()

    fake.socket.off("game:cooldown")
    fake.deliver("game:cooldown", 2)
    expect(second).toHaveBeenCalledOnce()
    expect(fake.listenerCount("game:cooldown")).toBe(0)
  })

  it("lets a listener unsubscribe while it is being told", () => {
    const fake = createFakeSocket()
    const other = vi.fn()
    const once = vi.fn(() => fake.socket.off("game:cooldown", once))

    fake.socket.on("game:cooldown", once)
    fake.socket.on("game:cooldown", other)
    fake.deliver("game:cooldown", 5)
    fake.deliver("game:cooldown", 4)

    expect(once).toHaveBeenCalledOnce()
    expect(other).toHaveBeenCalledTimes(2)
  })

  it("reports what the screens emit instead of sending it anywhere", () => {
    const fake = createFakeSocket()
    const seen = vi.fn()
    const stop = fake.onEmit(seen)

    fake.socket.emit("player:selectedAnswer", {
      gameId: "dev",
      data: { answerKey: 2 },
    })
    stop()
    fake.socket.emit("player:selectedAnswer", {
      gameId: "dev",
      data: { answerKey: 3 },
    })

    expect(seen).toHaveBeenCalledOnce()
    expect(seen).toHaveBeenCalledWith("player:selectedAnswer", {
      gameId: "dev",
      data: { answerKey: 2 },
    })
  })
})
