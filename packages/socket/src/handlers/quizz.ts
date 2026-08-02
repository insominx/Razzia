import { EVENTS } from "@razzia/common/constants"
import type { SocketContext } from "@razzia/socket/handlers/types"
import {
  deleteQuizz,
  getGameConfig,
  getQuizzById,
  saveQuizz,
  updateQuizz,
} from "@razzia/socket/services/config"
import manager, { emitConfig } from "@razzia/socket/services/manager"
import {
  finalizeBackgroundMutation,
  resolveVisuals,
} from "@razzia/socket/services/visuals"

export const quizzSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.QUIZZ.GET,
    manager.withAuth(socket, (id) => {
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
        emitConfig(socket)
      } catch (error) {
        console.error("Failed to save quizz:", error)
        const message =
          error instanceof Error ? error.message : "errors:quizz.failedToSave"
        socket.emit(EVENTS.QUIZZ.ERROR, message)
      }
    }),
  )

  socket.on(
    EVENTS.QUIZZ.DELETE,
    manager.withAuth(socket, (id) => {
      try {
        const mutation = deleteQuizz(id)
        finalizeBackgroundMutation(mutation.previousBackground)

        emitConfig(socket)
      } catch (error) {
        console.error("Failed to delete quizz:", error)
        socket.emit(EVENTS.QUIZZ.ERROR, "errors:quizz.failedToDelete")
      }
    }),
  )

  socket.on(
    EVENTS.QUIZZ.UPDATE,
    manager.withAuth(socket, ({ id, ...data }) => {
      try {
        const mutation = updateQuizz(id, data)
        finalizeBackgroundMutation(
          mutation.previousBackground,
          mutation.background,
        )

        socket.emit(EVENTS.QUIZZ.UPDATE_SUCCESS, { id: mutation.id })
        emitConfig(socket)
      } catch (error) {
        console.error("Failed to update quizz:", error)
        const message =
          error instanceof Error ? error.message : "errors:quizz.failedToUpdate"
        socket.emit(EVENTS.QUIZZ.ERROR, message)
      }
    }),
  )
}
