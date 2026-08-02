import { EVENTS } from "@razzia/common/constants"
import {
  backgroundRefValidator,
  dialectValidator,
} from "@razzia/common/validators/visuals"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { getGameConfig, updateGameConfig } from "@razzia/socket/services/config"
import { verifyManagerAuth } from "@razzia/socket/services/manager-auth"
import manager, { emitConfig } from "@razzia/socket/services/manager"
import {
  clearGlobalBackground,
  setGlobalBackground,
} from "@razzia/socket/services/visuals"

export const managerSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.MANAGER.GET_CONFIG,
    manager.withAuth(socket, () => {
      emitConfig(socket)
    }),
  )

  socket.on(
    EVENTS.MANAGER.GLOBAL_BACKGROUND_SET,
    manager.withAuth(socket, ({ background }, callback) => {
      try {
        const result = backgroundRefValidator.safeParse(background)

        if (!result.success) {
          throw new Error(result.error.issues[0].message)
        }

        setGlobalBackground(result.data)
        emitConfig(socket)
        callback?.({ ok: true })
      } catch (error) {
        console.error("Failed to set global background:", error)
        const message =
          error instanceof Error
            ? error.message
            : "errors:visuals.backgroundSetFailed"

        callback?.({ error: message })
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER.GLOBAL_BACKGROUND_CLEAR,
    manager.withAuth(socket, (callback) => {
      try {
        clearGlobalBackground()
        emitConfig(socket)
        callback?.({ ok: true })
      } catch (error) {
        console.error("Failed to clear global background:", error)
        callback?.({ error: "errors:visuals.backgroundClearFailed" })
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER.DIALECT_SET,
    manager.withAuth(socket, ({ dialect }, callback) => {
      try {
        const result = dialectValidator.safeParse(dialect)

        if (!result.success) {
          throw new Error(result.error.issues[0].message)
        }

        updateGameConfig((config) => ({
          ...config,
          visuals: {
            ...config.visuals,
            dialect: result.data,
          },
        }))
        emitConfig(socket)
        callback?.({ ok: true })
      } catch (error) {
        console.error("Failed to set dialect:", error)
        const message =
          error instanceof Error
            ? error.message
            : "errors:visuals.dialectSetFailed"

        callback?.({ error: message })
      }
    }),
  )

  socket.on(EVENTS.MANAGER.LOGOUT, () => {
    manager.logout(socket)
  })

  socket.on(EVENTS.MANAGER.AUTH, (password) => {
    try {
      const config = getGameConfig()
      const auth = verifyManagerAuth(password, config)

      if (!auth.ok) {
        socket.emit(EVENTS.MANAGER.ERROR_MESSAGE, auth.error)

        return
      }

      manager.login(socket)
      emitConfig(socket)
    } catch (error) {
      console.error("Failed to read game config:", error)
      socket.emit(EVENTS.MANAGER.ERROR_MESSAGE, "errors:failedToReadConfig")
    }
  })
}
