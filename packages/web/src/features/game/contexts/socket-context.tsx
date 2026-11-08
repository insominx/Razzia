import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@razzia/common/types/game/socket"
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { io, Socket } from "socket.io-client"
import { v7 as uuid } from "uuid"

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export interface SocketContextValue {
  socket: TypedSocket
  isConnected: boolean
  clientId: string
  connect: () => void
  disconnect: () => void
  reconnect: () => void
}

const getClientId = (): string => {
  try {
    const stored = localStorage.getItem("client_id")

    if (stored) {
      return stored
    }

    const newId = uuid()
    localStorage.setItem("client_id", newId)

    return newId
  } catch {
    return uuid()
  }
}

const clientId = getClientId()

export const socketClient: TypedSocket = io("/", {
  path: "/ws",
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  auth: { clientId },
})

// Exported for the dev Director, whose harness frames provide a fake socket.
export const SocketContext = createContext<SocketContextValue>({
  socket: socketClient,
  isConnected: false,
  clientId,
  connect: () => {
    /* Empty */
  },
  disconnect: () => {
    /* Empty */
  },
  reconnect: () => {
    /* Empty */
  },
})

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const handleConnect = () => setIsConnected(true)
    const handleDisconnect = () => setIsConnected(false)
    const handleConnectError = (err: Error) => {
      console.error("Connection error:", err.message)
    }

    socketClient.on("connect", handleConnect)
    socketClient.on("disconnect", handleDisconnect)
    socketClient.on("connect_error", handleConnectError)

    return () => {
      // Remounting must not stack a second set of listeners on the socket.
      socketClient.off("connect", handleConnect)
      socketClient.off("disconnect", handleDisconnect)
      socketClient.off("connect_error", handleConnectError)
      socketClient.disconnect()
    }
  }, [])

  const connect = useCallback(() => {
    if (!socketClient.connected) {
      socketClient.connect()
    }
  }, [])

  const disconnect = useCallback(() => {
    if (socketClient.connected) {
      socketClient.disconnect()
    }
  }, [])

  const reconnect = useCallback(() => {
    socketClient.disconnect()
    socketClient.connect()
  }, [])

  return (
    <SocketContext.Provider
      value={{
        socket: socketClient,
        isConnected,
        clientId,
        connect,
        disconnect,
        reconnect,
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)

/**
 * Calls `callback` for each `event` from the server.
 *
 * The socket is subscribed once, to a function that calls whichever callback the
 * last committed render passed. Subscribing the callback itself each render left a
 * gap: until the next passive effect ran, the socket still held an older render's
 * handler, so a handler that read state from its closure saw stale state when events
 * arrived in a burst (a lobby filling from many phones lost names that way).
 *
 * A handler that builds the next state from the current one must still not read it
 * from the render: several events can arrive before the next render, so use a
 * functional update, a store, or a ref the handler keeps current.
 */
export const useEvent = <E extends keyof ServerToClientEvents>(
  event: E,
  callback: ServerToClientEvents[E],
) => {
  const { socket } = useSocket()
  const latest = useRef(callback)

  // Before paint, so there is no moment when the subscription calls an older render.
  useLayoutEffect(() => {
    latest.current = callback
  })

  useEffect(() => {
    const handler = (...args: unknown[]) => {
      // The event's own type is checked where the hook is called.
      const call = latest.current as unknown as (...rest: unknown[]) => void

      call(...args)
    }

    // oxlint-disable-next-line no-explicit-any, no-unsafe-argument
    socket.on(event, handler as any)

    return () => {
      // oxlint-disable-next-line no-explicit-any, no-unsafe-argument
      socket.off(event, handler as any)
    }
  }, [socket, event])
}
