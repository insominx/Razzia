import type { Socket } from "@razzia/common/types/game/socket"

type Listener = (...args: unknown[]) => unknown

const report = (event: string, error: unknown) => {
  console.error(`Handler for "${event}" failed:`, error)
}

// Socket.IO runs a handler with no try/catch of its own, so one that throws,
// or returns a promise that rejects, would end the process and every game on
// it. Each handler registered after this is logged instead when it fails.
export const guardHandlers = (socket: Socket): void => {
  const on = socket.on.bind(socket) as (
    _event: string,
    _listener: Listener,
  ) => Socket

  const guardedOn = (event: string, listener: Listener) =>
    on(event, (...args) => {
      try {
        const result = listener(...args)

        if (result instanceof Promise) {
          result.catch((error: unknown) => {
            report(event, error)
          })
        }
      } catch (error) {
        report(event, error)
      }
    })

  socket.on = guardedOn as unknown as Socket["on"]
}
