import { EVENTS } from "@razzia/common/constants"
import {
  ackOf,
  clientMessage,
  fieldsOf,
  textOf,
} from "@razzia/socket/handlers/payload"
import type { SocketContext } from "@razzia/socket/handlers/types"
import {
  deleteQuizz,
  getGameConfig,
  getQuizzById,
  saveQuizz,
  updateQuizz,
} from "@razzia/socket/services/config"
import manager, { emitConfigSafely } from "@razzia/socket/services/manager"
import {
  finalizeBackgroundMutation,
  resolveVisuals,
} from "@razzia/socket/services/visuals"
import { ItemNotFoundError } from "@razzia/socket/utils/safe"

export const quizzSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.QUIZZ.GET,
    manager.withAuth(socket, (message) => {
      const id = textOf(message)

      if (id === undefined) {
        return
      }

      try {
        const quizz = getQuizzById(id)
        const resolvedVisuals = resolveVisuals(quizz, getGameConfig())

        socket.emit(EVENTS.QUIZZ.DATA, { quizz, resolvedVisuals })
      } catch (error) {
        console.error("Failed to get quizz:", error)
        socket.emit(EVENTS.QUIZZ.ERROR, "errors:quizz.notFound")
      }
    }),
  )

  socket.on(
    EVENTS.QUIZZ.SAVE,
    manager.withAuth(socket, (data) => {
      try {
        const mutation = saveQuizz(data)
        finalizeBackgroundMutation(
          mutation.previousBackground,
          mutation.background,
        )

        socket.emit(EVENTS.QUIZZ.SAVE_SUCCESS, { id: mutation.id })
        emitConfigSafely(socket)
      } catch (error) {
        console.error("Failed to save quizz:", error)
        socket.emit(
          EVENTS.QUIZZ.ERROR,
          clientMessage(error, "errors:quizz.failedToSave"),
        )
      }
    }),
  )

  socket.on(
    EVENTS.QUIZZ.DELETE,
    manager.withAuth(socket, (message, callback) => {
      const reply = ackOf(callback)
      const id = textOf(message)

      if (id === undefined) {
        reply?.({ error: "errors:quizz.failedToDelete" })

        return
      }

      try {
        const mutation = deleteQuizz(id)
        finalizeBackgroundMutation(mutation.previousBackground)
      } catch (error) {
        // A double click or a second tab: the quiz is gone either way.
        if (!(error instanceof ItemNotFoundError)) {
          console.error("Failed to delete quizz:", error)
          reply?.({ error: "errors:quizz.failedToDelete" })

          return
        }
      }

      reply?.({ ok: true })
      emitConfigSafely(socket)
    }),
  )

  socket.on(
    EVENTS.QUIZZ.UPDATE,
    manager.withAuth(socket, (request) => {
      const { id, ...data } = fieldsOf(request)

      if (typeof id !== "string") {
        return
      }

      try {
        const mutation = updateQuizz(id, data)
        finalizeBackgroundMutation(
          mutation.previousBackground,
          mutation.background,
        )

        socket.emit(EVENTS.QUIZZ.UPDATE_SUCCESS, { id: mutation.id })
        emitConfigSafely(socket)
      } catch (error) {
        console.error("Failed to update quizz:", error)
        socket.emit(
          EVENTS.QUIZZ.ERROR,
          clientMessage(error, "errors:quizz.failedToUpdate"),
        )
      }
    }),
  )
}
