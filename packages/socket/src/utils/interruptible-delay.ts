export interface InterruptibleDelay {
  promise: Promise<void>
  interrupt: () => void
}

export const createInterruptibleDelay = (
  durationMs: number,
): InterruptibleDelay => {
  let settled = false
  let resolveDelay: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    resolveDelay = resolve
  })
  const timeout = setTimeout(() => finish(), Math.max(0, durationMs))

  function finish(): void {
    if (settled) {
      return
    }

    settled = true
    clearTimeout(timeout)
    resolveDelay()
  }

  return { promise, interrupt: finish }
}
