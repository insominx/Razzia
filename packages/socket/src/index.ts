import type { Server } from "@razzia/common/types/game/socket"
import { gameSocketHandlers } from "@razzia/socket/handlers/game"
import { guardHandlers } from "@razzia/socket/handlers/guard"
import { managerSocketHandlers } from "@razzia/socket/handlers/manager"
import { quizzSocketHandlers } from "@razzia/socket/handlers/quizz"
import { resultsSocketHandlers } from "@razzia/socket/handlers/results"
import type { SocketHandler } from "@razzia/socket/handlers/types"
import { initConfig } from "@razzia/socket/services/config"
import Registry from "@razzia/socket/services/registry"
import manager from "@razzia/socket/services/manager"
import {
  cleanupBackgroundAssetsOnStartup,
  backgroundPathFromUrl,
  ensureBackgroundAssetsDirectory,
  serveBackgroundUpload,
  serveConfigAsset,
  setLiveBackgroundPathsProvider,
} from "@razzia/socket/services/visuals"
import { requireClientId } from "@razzia/socket/utils/safe"
import { createServer } from "http"
import { Server as ServerIO } from "socket.io"

const WS_PORT = 3001

const httpServer = createServer((request, response) => {
  void (async () => {
    try {
      if (
        await serveBackgroundUpload(request, response, (clientId) =>
          manager.isLoggedByClientId(clientId),
        )
      ) {
        return
      }

      if (serveConfigAsset(request, response)) {
        return
      }

      response.writeHead(404)
      response.end()
    } catch (error) {
      // An unhandled rejection here would take every live game down.
      console.error("Failed to handle request:", error)

      if (!response.headersSent) {
        response.writeHead(500)
      }

      response.end()
    }
  })()
})

// Background bytes use HTTP; keep the Socket.IO default buffer for events.
const io: Server = new ServerIO(httpServer, {
  path: "/ws",
  // The web app bundles its own client; no need to serve one (or its version).
  serveClient: false,
})

// Every socket carries a sane clientId or it never connects.
io.use(requireClientId)
initConfig()
ensureBackgroundAssetsDirectory()
// A game keeps showing the background it started with, so replacing or
// clearing it in the settings must not delete the file under a running game.
setLiveBackgroundPathsProvider(() =>
  Registry.getInstance()
    .getAllGames()
    .flatMap((game) => {
      const path = backgroundPathFromUrl(game.visuals.backgroundUrl)

      return path ? [path] : []
    }),
)
cleanupBackgroundAssetsOnStartup()

// The catch-all handler below keeps games alive, so a failed bind would leave
// a process that serves nothing and never restarts. Exit instead, so the
// supervisor (or the dev watcher) starts it again.
httpServer.on("error", (error) => {
  console.error("Socket server could not listen:", error)
  process.exit(1)
})

console.log(`Socket server running on port ${WS_PORT}`)
httpServer.listen(WS_PORT)

const socketHandlers: SocketHandler[] = [
  managerSocketHandlers,
  quizzSocketHandlers,
  gameSocketHandlers,
  resultsSocketHandlers,
]

io.on("connection", (socket) => {
  console.log(`A user connected: socketId: ${socket.id}`)

  guardHandlers(socket)
  socketHandlers.forEach((handler) => {
    handler({ io, socket })
  })
})

// A redeploy mid-lecture still keeps the questions a lecture game played.
const shutdown = () => {
  const registry = Registry.getInstance()

  registry.getAllGames().forEach((game) => {
    game.saveUnfinishedLecture()
  })
  registry.cleanup()
  process.exit(0)
}

process.on("SIGINT", shutdown)

process.on("SIGTERM", shutdown)

// Backstops for timers and detached async work: log, keep the games running.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason)
})

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error)
})
