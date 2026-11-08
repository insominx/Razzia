import { EVENTS } from "@razzia/common/constants"
import type { Socket } from "@razzia/common/types/game/socket"
import type { SocketContext } from "@razzia/socket/handlers/types"
import {
  getGameConfig,
  getQuizzMeta,
  getResultsMeta,
} from "@razzia/socket/services/config"
import { resolveVisuals } from "@razzia/socket/services/visuals"

const getClientId = (socket: SocketContext["socket"]) =>
  socket.handshake.auth.clientId as string

type ErrorAck = (_response: { error: string }) => void

const isErrorAck = (value: unknown): value is ErrorAck =>
  typeof value === "function"

export const emitConfig = (socket: SocketContext["socket"]) => {
  const gameConfig = getGameConfig()

  socket.emit(EVENTS.MANAGER.CONFIG, {
    quizz: getQuizzMeta(),
    results: getResultsMeta(),
    game: {
      visuals: gameConfig.visuals,
      resolvedVisuals: resolveVisuals(undefined, gameConfig),
    },
  })
}

// A login is forgotten after this long without any authorized call, so a
// forgotten tab or a one-off visitor does not stay logged in forever. Every
// authorized call (and a host reconnecting to a game) starts the time again.
export const LOGIN_IDLE_MS = 12 * 60 * 60_000

// Hard bound on remembered logins; the least recently used one goes first.
export const MAX_LOGGED_CLIENTS = 500

class Manager {
  // The client id maps to the time of its last authorized call. A Map keeps insertion order
  // and a refresh re-inserts, so the first entry is always the least recently
  // used one and the expired ones are all at the front.
  private loggedClients = new Map<string, number>()

  private isActive(clientId: string, now: number) {
    const lastSeen = this.loggedClients.get(clientId)

    if (lastSeen === undefined) {
      return false
    }

    if (now - lastSeen >= LOGIN_IDLE_MS) {
      this.loggedClients.delete(clientId)

      return false
    }

    return true
  }

  private touch(clientId: string, now: number) {
    this.loggedClients.delete(clientId)
    this.loggedClients.set(clientId, now)
  }

  private prune(now: number) {
    for (const [clientId, lastSeen] of this.loggedClients) {
      if (
        now - lastSeen < LOGIN_IDLE_MS &&
        this.loggedClients.size <= MAX_LOGGED_CLIENTS
      ) {
        return
      }

      this.loggedClients.delete(clientId)
    }
  }

  // Asking refreshes: a host who is still using the app is never logged out
  // under their hands, only one who has been gone for the whole window.
  isLoggedByClientId(clientId: string) {
    const now = Date.now()

    if (!this.isActive(clientId, now)) {
      return false
    }

    this.touch(clientId, now)

    return true
  }

  isLogged(socket: Socket) {
    return this.isLoggedByClientId(getClientId(socket))
  }

  login(socket: Socket) {
    const now = Date.now()

    this.touch(getClientId(socket), now)
    this.prune(now)
  }

  logout(socket: Socket) {
    this.loggedClients.delete(getClientId(socket))
  }

  withAuth<T extends unknown[]>(
    socket: Socket,
    handler: (..._args: T) => void,
  ) {
    return (...args: T) => {
      if (!this.isLogged(socket)) {
        socket.emit(EVENTS.MANAGER.UNAUTHORIZED)
        const maybeCallback: unknown = args[args.length - 1]

        if (isErrorAck(maybeCallback)) {
          maybeCallback({ error: "errors:manager.unauthorized" })
        }

        return
      }

      handler(...args)
    }
  }
}

export default new Manager()

// For a plain request for the config: a config problem must reach the host as
// a message, not as a silent nothing.
export const emitConfigOrError = (socket: SocketContext["socket"]) => {
  try {
    emitConfig(socket)
  } catch (error) {
    console.error("Failed to read the config:", error)
    socket.emit(
      EVENTS.MANAGER.ERROR_MESSAGE,
      "errors:manager.failedToReadConfig",
    )
  }
}

// The refresh after a change that is already saved: if it fails, the change
// must not be reported as failed.
export const emitConfigSafely = (socket: SocketContext["socket"]) => {
  try {
    emitConfig(socket)
  } catch (error) {
    console.error("Failed to refresh the config after a change:", error)
  }
}
