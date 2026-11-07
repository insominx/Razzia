import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@razzia/common/types/game/socket"
import type { Socket } from "socket.io-client"

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

type Listener = (...args: unknown[]) => void

export type EmitListener = (event: string, ...args: unknown[]) => void

export interface FakeSocket {
  /** Stands in for the real client socket inside a harness frame. */
  socket: TypedSocket
  /** Server to client: what `io.emit` would reach the screens as. */
  deliver: (event: string, ...args: unknown[]) => void
  /** Client to server: what the screens send. Nothing leaves the page. */
  onEmit: (listener: EmitListener) => () => void
  /** The same path the screens' own `socket.emit` takes, without the types. */
  emit: EmitListener
  listenerCount: (event: string) => number
}

/**
 * The screens only ever call `on`, `off` and `emit` on the socket. A harness
 * frame hands them this instead of the real client, so a Director never talks
 * to a game server and a tapped tile can be answered by the Director itself.
 */
export const createFakeSocket = (): FakeSocket => {
  const listeners = new Map<string, Set<Listener>>()
  const emitListeners = new Set<EmitListener>()

  const emit: EmitListener = (event, ...args) => {
    for (const listener of [...emitListeners]) {
      listener(event, ...args)
    }
  }

  const socket = {
    id: "fake-socket",
    connected: true,
    on(event: string, listener: Listener) {
      const set = listeners.get(event) ?? new Set<Listener>()

      set.add(listener)
      listeners.set(event, set)

      return socket
    },
    off(event: string, listener?: Listener) {
      if (listener) {
        listeners.get(event)?.delete(listener)
      } else {
        listeners.delete(event)
      }

      return socket
    },
    emit(event: string, ...args: unknown[]) {
      emit(event, ...args)

      return true
    },
  }

  return {
    socket: socket as unknown as TypedSocket,
    // Copied first: a screen unsubscribes while it is being told something.
    deliver: (event, ...args) => {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        listener(...args)
      }
    },
    onEmit: (listener) => {
      emitListeners.add(listener)

      return () => {
        emitListeners.delete(listener)
      }
    },
    emit,
    listenerCount: (event) => listeners.get(event)?.size ?? 0,
  }
}
