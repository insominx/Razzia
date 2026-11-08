/** How long a command waits for the server's answer before it gives up. */
export const ACK_TIMEOUT_MS = 5_000

/**
 * Sends a command and waits for its outcome, or says `"noAck"` after a while.
 *
 * The server answers a command through its ack, but a room that is gone never
 * answers (and a dropped connection loses the reply), so a button that waits
 * on the ack alone could stay locked for good. Whatever comes first settles
 * it, once.
 */
export const emitWithAck = <Outcome>(
  send: (_ack: (_outcome: Outcome) => void) => void,
  timeoutMs = ACK_TIMEOUT_MS,
): Promise<Outcome | "noAck"> =>
  new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve("noAck")
      }
    }, timeoutMs)

    send((outcome) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve(outcome)
      }
    })
  })
