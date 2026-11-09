import { EVENTS } from "@razzia/common/constants"
import {
  ackOf,
  clientMessage,
  fieldsOf,
  textOf,
} from "@razzia/socket/handlers/payload"
import type { SocketContext } from "@razzia/socket/handlers/types"
import manager, { emitConfigSafely } from "@razzia/socket/services/manager"
import {
  deletePoll,
  deletePollResult,
  getPollById,
  getPollResultById,
  savePoll,
  updatePoll,
} from "@razzia/socket/services/poll-store"
import { ItemNotFoundError } from "@razzia/socket/utils/safe"

/**
 * The polls a host keeps: reading, saving, changing and deleting them. Running
 * one is the game's business (`handlers/game.ts`); a running poll never reads
 * these files again after it starts.
 */
export const pollsSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.POLLS.GET,
    manager.withAuth(socket, (message) => {
      const id = textOf(message)

      if (id === undefined) {
        return
      }

      try {
        socket.emit(EVENTS.POLLS.DATA, { poll: getPollById(id) })
      } catch (error) {
        console.error("Failed to get poll:", error)
        socket.emit(EVENTS.POLLS.ERROR, "errors:poll.notFound")
      }
    }),
  )

  socket.on(
    EVENTS.POLLS.SAVE,
    manager.withAuth(socket, (request) => {
      // The editor names a new poll once; see savePoll.
      const { id, ...data } = fieldsOf(request)

      try {
        socket.emit(EVENTS.POLLS.SAVE_SUCCESS, { id: savePoll(data, id) })
        emitConfigSafely(socket)
      } catch (error) {
        console.error("Failed to save poll:", error)
        socket.emit(
          EVENTS.POLLS.ERROR,
          clientMessage(error, "errors:poll.failedToSave"),
        )
      }
    }),
  )

  socket.on(
    EVENTS.POLLS.UPDATE,
    manager.withAuth(socket, (request) => {
      const { id, ...data } = fieldsOf(request)

      if (typeof id !== "string") {
        return
      }

      try {
        socket.emit(EVENTS.POLLS.UPDATE_SUCCESS, { id: updatePoll(id, data) })
        emitConfigSafely(socket)
      } catch (error) {
        console.error("Failed to update poll:", error)
        socket.emit(
          EVENTS.POLLS.ERROR,
          clientMessage(error, "errors:poll.failedToUpdate"),
        )
      }
    }),
  )

  socket.on(
    EVENTS.POLLS.DELETE,
    manager.withAuth(socket, (message, callback) => {
      const reply = ackOf(callback)
      const id = textOf(message)

      if (id === undefined) {
        reply?.({ error: "errors:poll.failedToDelete" })

        return
      }

      try {
        deletePoll(id)
      } catch (error) {
        // A double click or a second tab: the poll is gone either way.
        if (!(error instanceof ItemNotFoundError)) {
          console.error("Failed to delete poll:", error)
          reply?.({ error: "errors:poll.failedToDelete" })

          return
        }
      }

      reply?.({ ok: true })
      emitConfigSafely(socket)
    }),
  )

  socket.on(
    EVENTS.POLLS.RESULT_GET,
    manager.withAuth(socket, (message) => {
      const id = textOf(message)

      if (id === undefined) {
        return
      }

      try {
        socket.emit(EVENTS.POLLS.RESULT_DATA, getPollResultById(id))
      } catch (error) {
        console.error("Failed to get poll result:", error)
        socket.emit(EVENTS.POLLS.ERROR, "errors:poll.resultNotFound")
      }
    }),
  )

  socket.on(
    EVENTS.POLLS.RESULT_DELETE,
    manager.withAuth(socket, (message, callback) => {
      const reply = ackOf(callback)
      const id = textOf(message)

      if (id === undefined) {
        reply?.({ error: "errors:poll.failedToDeleteResult" })

        return
      }

      try {
        deletePollResult(id)
      } catch (error) {
        // A double click or a second tab: the result is gone either way.
        if (!(error instanceof ItemNotFoundError)) {
          console.error("Failed to delete poll result:", error)
          reply?.({ error: "errors:poll.failedToDeleteResult" })

          return
        }
      }

      reply?.({ ok: true })
      emitConfigSafely(socket)
    }),
  )
}
