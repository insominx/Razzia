// Slows down guessing of the manager password and invite codes. Past a few
// misses a key is locked out for a time that doubles with every further miss.

// A key quiet for this long starts over.
const FORGET_AFTER_MS = 30 * 60_000
const MAX_KEYS = 10_000

interface Attempts {
  failures: number
  lockedUntil: number
  lastFailure: number
}

interface ThrottleOptions {
  // Misses a key gets before it is locked out.
  freeAttempts: number
  baseLockMs: number
  maxLockMs: number
}

export class AuthThrottle {
  private readonly records = new Map<string, Attempts>()

  constructor(
    private readonly options: ThrottleOptions = {
      freeAttempts: 5,
      baseLockMs: 15_000,
      maxLockMs: 15 * 60_000,
    },
    private readonly now: () => number = Date.now,
  ) {}

  // Milliseconds left before the keys may try again; 0 when they may.
  retryAfter(keys: string[]): number {
    const now = this.now()

    return keys.reduce((wait, key) => {
      const record = this.records.get(key)

      return record ? Math.max(wait, record.lockedUntil - now) : wait
    }, 0)
  }

  fail(keys: string[]): void {
    const now = this.now()
    this.prune(now)

    for (const key of keys) {
      const known = this.records.get(key)
      const record: Attempts =
        known && now - known.lastFailure < FORGET_AFTER_MS
          ? known
          : { failures: 0, lockedUntil: 0, lastFailure: now }

      record.failures += 1
      record.lastFailure = now

      if (record.failures > this.options.freeAttempts) {
        const lock = Math.min(
          this.options.maxLockMs,
          this.options.baseLockMs *
            2 ** (record.failures - this.options.freeAttempts - 1),
        )
        record.lockedUntil = now + lock
      }

      this.records.delete(key)
      this.records.set(key, record)
    }
  }

  succeed(keys: string[]): void {
    for (const key of keys) {
      this.records.delete(key)
    }
  }

  private prune(now: number) {
    for (const [key, record] of this.records) {
      if (now - record.lastFailure >= FORGET_AFTER_MS) {
        this.records.delete(key)
      }
    }

    // Insertion order is least recently failed first.
    while (this.records.size >= MAX_KEYS) {
      const oldest = this.records.keys().next().value

      if (oldest === undefined) {
        break
      }

      this.records.delete(oldest)
    }
  }
}

// The manager password gets two tiers. A client is held to a tight limit, so
// one person's typos lock out that person only. An address gets a much looser
// limit: a whole class can sit behind one address (a school network, or this
// server's own reverse proxy), so it must outlast every typo, yet it still
// stops one machine that keeps changing its client id. A client that has
// already logged in as the host is exempt from the address tier, so nobody
// on the same network can lock the teacher out.
export const authThrottle = new AuthThrottle()

export const authAddressThrottle = new AuthThrottle({
  freeAttempts: 30,
  baseLockMs: 5_000,
  maxLockMs: 60_000,
})

// Invite codes are held to the client tier only. Behind the reverse proxy
// every visitor shares one address, so an address limit there would let one
// student, or one attacker, keep the whole class from joining.
export const inviteThrottle = new AuthThrottle({
  freeAttempts: 10,
  baseLockMs: 5_000,
  maxLockMs: 60_000,
})

// Client ids that have logged in as the host in this process.
const MAX_TRUSTED = 100
const trusted = new Set<string>()

export const trustedHosts = {
  has: (clientId: string) => trusted.has(clientId),
  add: (clientId: string) => {
    trusted.delete(clientId)
    trusted.add(clientId)

    while (trusted.size > MAX_TRUSTED) {
      const oldest = trusted.values().next().value

      if (oldest === undefined) {
        break
      }

      trusted.delete(oldest)
    }
  },
}
