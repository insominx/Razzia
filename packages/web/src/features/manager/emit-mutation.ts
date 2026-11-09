import type { ManagerMutationResponse } from "@razzia/common/types/manager"

// Longer than any of these takes, short enough that a dead socket frees the
// controls instead of leaving them disabled.
export const MUTATION_ACK_TIMEOUT_MS = 5_000

interface TimeoutEmitter {
  emit: (_event: string, ..._args: unknown[]) => unknown
}

/**
 * Emits a manager mutation and reports its answer once: the server's response,
 * or null when no answer came in time or the connection dropped.
 *
 * The typed socket marks these acks as optional, and socket.io only adds the
 * leading error argument to a required ack, so the call goes through an
 * untyped emitter here, in one place.
 */
export const emitMutation = (
  socket: { timeout: (_ms: number) => unknown },
  [event, ...args]: [event: string, ...args: unknown[]],
  onSettled: (_response: ManagerMutationResponse | null) => void,
) => {
  const emitter = socket.timeout(MUTATION_ACK_TIMEOUT_MS) as TimeoutEmitter

  emitter.emit(
    event,
    ...args,
    (error: Error | null, response?: ManagerMutationResponse) => {
      onSettled(error || !response ? null : response)
    },
  )
}
