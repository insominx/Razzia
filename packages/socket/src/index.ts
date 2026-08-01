import type { Server } from "@razzia/common/types/game/socket"
import { gameSocketHandlers } from "@razzia/socket/handlers/game"
import { managerSocketHandlers } from "@razzia/socket/handlers/manager"
import { quizzSocketHandlers } from "@razzia/socket/handlers/quizz"
import { resultsSocketHandlers } from "@razzia/socket/handlers/results"
import type { SocketHandler } from "@razzia/socket/handlers/types"
import { initConfig } from "@razzia/socket/services/config"
import Registry from "@razzia/socket/services/registry"
import manager from "@razzia/socket/services/manager"
import {
  ensureBackgroundAssetsDirectory,
  serveBackgroundUpload,
  serveConfigAsset,
  SOCKET_MAX_HTTP_BUFFER_SIZE,
} from "@razzia/socket/services/visuals"
import { createServer } from "http"
import { Server as ServerIO } from "socket.io"

const WS_PORT = 3001

const httpServer = createServer((request, response) => {
  void (async () => {
    if (await serveBackgroundUpload(request, response, (clientId) =>
      manager.isLoggedByClientId(clientId),
    )) {
      return
    }

    if (serveConfigAsset(request, response)) {
      return
    }

    response.writeHead(404)
    response.end()
  })()
})

const io: Server = new ServerIO(httpServer, {
  path: "/ws",
  maxHttpBufferSize: SOCKET_MAX_HTTP_BUFFER_SIZE,
})
initConfig()
ensureBackgroundAssetsDirectory()

console.log(`Socket server running on port ${WS_PORT}`)
httpServer.listen(WS_PORT)

const socketHandlers: SocketHandler[] = [
  managerSocketHandlers,
  quizzSocketHandlers,
  gameSocketHandlers,
  resultsSocketHandlers,
]

io.on("connection", (socket) => {
  console.log(
    `A user connected: socketId: ${socket.id}, clientId: ${socket.handshake.auth.clientId}`,
  )

  socketHandlers.forEach((handler) => {
    handler({ io, socket })
  })
})

process.on("SIGINT", () => {
  Registry.getInstance().cleanup()
  process.exit(0)
})

process.on("SIGTERM", () => {
  Registry.getInstance().cleanup()
  process.exit(0)
})
