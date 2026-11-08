import { AuthThrottle } from "@razzia/socket/services/auth-throttle"
import { describe, expect, it } from "vitest"

const options = { freeAttempts: 3, baseLockMs: 1_000, maxLockMs: 8_000 }

const makeThrottle = () => {
  let now = 0
  const throttle = new AuthThrottle(options, () => now)

  return {
    throttle,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe("AuthThrottle", () => {
  it("lets a key miss a few times before it locks", () => {
    const { throttle } = makeThrottle()

    for (let i = 0; i < 3; i += 1) {
      throttle.fail(["a"])
    }

    expect(throttle.retryAfter(["a"])).toBe(0)

    throttle.fail(["a"])

    expect(throttle.retryAfter(["a"])).toBe(1_000)
  })

  it("doubles the lock with every further miss, up to a ceiling", () => {
    const { throttle } = makeThrottle()

    for (let i = 0; i < 4; i += 1) {
      throttle.fail(["a"])
    }

    expect(throttle.retryAfter(["a"])).toBe(1_000)
    throttle.fail(["a"])
    expect(throttle.retryAfter(["a"])).toBe(2_000)

    for (let i = 0; i < 10; i += 1) {
      throttle.fail(["a"])
    }

    expect(throttle.retryAfter(["a"])).toBe(8_000)
  })

  it("frees the key once the lock has run out", () => {
    const { throttle, advance } = makeThrottle()

    for (let i = 0; i < 4; i += 1) {
      throttle.fail(["a"])
    }

    advance(1_000)

    expect(throttle.retryAfter(["a"])).toBe(0)
  })

  it("locks on the worst of several keys and forgets them on success", () => {
    const { throttle } = makeThrottle()

    for (let i = 0; i < 4; i += 1) {
      throttle.fail(["address", "client"])
    }

    expect(throttle.retryAfter(["address", "other-client"])).toBe(1_000)
    expect(throttle.retryAfter(["other-address", "client"])).toBe(1_000)
    expect(throttle.retryAfter(["other-address", "other-client"])).toBe(0)

    throttle.succeed(["address", "client"])

    expect(throttle.retryAfter(["address", "client"])).toBe(0)
  })

  it("starts a quiet key over and bounds what it remembers", () => {
    const { throttle, advance } = makeThrottle()

    for (let i = 0; i < 4; i += 1) {
      throttle.fail(["old"])
    }

    advance(60 * 60_000)
    throttle.fail(["old"])

    expect(throttle.retryAfter(["old"])).toBe(0)

    for (let i = 0; i < 12_000; i += 1) {
      throttle.fail([`key-${i}`])
    }

    expect(
      (throttle as unknown as { records: Map<string, unknown> }).records.size,
    ).toBeLessThanOrEqual(10_000)
  })
})
