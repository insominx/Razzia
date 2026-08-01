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

class Manager {
  private loggedClients = new Set<string>()

  isLogged(socket: Socket) {
    return this.loggedClients.has(getClientId(socket))
  }

  isLoggedByClientId(clientId: string) {
    return this.loggedClients.has(clientId)
  }

  login(socket: Socket) {
    this.loggedClients.add(getClientId(socket))
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
        const maybeCallback = args[args.length - 1]

        if (typeof maybeCallback === "function") {
          maybeCallback({ error: "errors:manager.unauthorized" })
        }

        return
      }

      handler(...args)
    }
  }
}

export default new Manager()
