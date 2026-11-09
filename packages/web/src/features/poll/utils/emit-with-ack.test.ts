import {
  ACK_TIMEOUT_MS,
  emitWithAck,
} from "@razzia/web/features/poll/utils/emit-with-ack"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A server that answers `outcome` after `ms`.
const answersAfter =
  (ms: number, outcome: string) => (ack: (_outcome: string) => void) => {
    setTimeout(() => {
      ack(outcome)
    }, ms)
  }

describe("emitWithAck", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("resolves with the outcome the server acks", async () => {
    const result = emitWithAck<string>(answersAfter(100, "accepted"))

    await vi.advanceTimersByTimeAsync(100)

    await expect(result).resolves.toBe("accepted")
  })

  it("resolves when the ack comes at once", async () => {
    await expect(
      emitWithAck<string>((ack) => {
        ack("busy")
      }),
    ).resolves.toBe("busy")
  })

  it("gives up with noAck when the server never answers", async () => {
    const result = emitWithAck<string>(() => undefined)

    await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS)

    await expect(result).resolves.toBe("noAck")
  })

  it("settles once: a late ack after the give-up changes nothing", async () => {
    const result = emitWithAck<string>(
      answersAfter(ACK_TIMEOUT_MS + 1_000, "accepted"),
    )

    await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS + 2_000)

    await expect(result).resolves.toBe("noAck")
  })

  it("stops its timer once answered", async () => {
    await emitWithAck<string>((ack) => {
      ack("accepted")
    })

    expect(vi.getTimerCount()).toBe(0)
  })
})
