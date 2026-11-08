import { EVENTS } from "@razzia/common/constants"
import { ackOf, textOf } from "@razzia/socket/handlers/payload"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { deleteResult, getResultById } from "@razzia/socket/services/config"
import manager, { emitConfigSafely } from "@razzia/socket/services/manager"
import { ItemNotFoundError } from "@razzia/socket/utils/safe"

export const resultsSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.RESULTS.GET,
    manager.withAuth(socket, (message) => {
      const id = textOf(message)

      if (id === undefined) {
        return
      }

      try {
        socket.emit(EVENTS.RESULTS.DATA, getResultById(id))
      } catch (error) {
        console.error("Failed to get result:", error)
      }
    }),
  )

  socket.on(
    EVENTS.RESULTS.DELETE,
    manager.withAuth(socket, (message, callback) => {
      const reply = ackOf(callback)
      const id = textOf(message)

      if (id === undefined) {
        reply?.({ error: "errors:result.failedToDelete" })

        return
      }

      try {
        deleteResult(id)
      } catch (error) {
        // A double click or a second tab: the result is gone either way.
        if (!(error instanceof ItemNotFoundError)) {
          console.error("Failed to delete result:", error)
          reply?.({ error: "errors:result.failedToDelete" })

          return
        }
      }

      reply?.({ ok: true })
      emitConfigSafely(socket)
    }),
  )
}
