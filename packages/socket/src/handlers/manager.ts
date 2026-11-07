import { EVENTS } from "@razzia/common/constants"
import {
  backgroundRefValidator,
  dialectValidator,
  showIntensityValidator,
  soundThemeValidator,
} from "@razzia/common/validators/visuals"
import { ackOf, fieldsOf } from "@razzia/socket/handlers/payload"
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
    manager.withAuth(socket, (request, callback) => {
      const reply = ackOf(callback)

      try {
        const result = backgroundRefValidator.safeParse(
          fieldsOf(request).background,
        )

        if (!result.success) {
          throw new Error(result.error.issues[0].message)
        }

        setGlobalBackground(result.data)
        emitConfig(socket)
        reply?.({ ok: true })
      } catch (error) {
        console.error("Failed to set global background:", error)
        const message =
          error instanceof Error
            ? error.message
            : "errors:visuals.backgroundSetFailed"

        reply?.({ error: message })
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER.GLOBAL_BACKGROUND_CLEAR,
    manager.withAuth(socket, (callback) => {
      const reply = ackOf(callback)

      try {
        clearGlobalBackground()
        emitConfig(socket)
        reply?.({ ok: true })
      } catch (error) {
        console.error("Failed to clear global background:", error)
        reply?.({ error: "errors:visuals.backgroundClearFailed" })
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER.DIALECT_SET,
    manager.withAuth(socket, (request, callback) => {
      const reply = ackOf(callback)

      try {
        const result = dialectValidator.safeParse(fieldsOf(request).dialect)

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
        reply?.({ ok: true })
      } catch (error) {
        console.error("Failed to set dialect:", error)
        const message =
          error instanceof Error
            ? error.message
            : "errors:visuals.dialectSetFailed"

        reply?.({ error: message })
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER.SOUND_THEME_SET,
    manager.withAuth(socket, (request, callback) => {
      const reply = ackOf(callback)

      try {
        const result = soundThemeValidator.safeParse(
          fieldsOf(request).soundTheme,
        )

        if (!result.success) {
          throw new Error(result.error.issues[0].message)
        }

        updateGameConfig((config) => ({
          ...config,
          visuals: {
            ...config.visuals,
            soundTheme: result.data,
          },
        }))
        emitConfig(socket)
        reply?.({ ok: true })
      } catch (error) {
        console.error("Failed to set sound theme:", error)
        const message =
          error instanceof Error
            ? error.message
            : "errors:visuals.soundThemeSetFailed"

        reply?.({ error: message })
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER.SHOW_INTENSITY_SET,
    manager.withAuth(socket, (request, callback) => {
      const reply = ackOf(callback)

      try {
        const result = showIntensityValidator.safeParse(
          fieldsOf(request).showIntensity,
        )

        if (!result.success) {
          throw new Error(result.error.issues[0].message)
        }

        updateGameConfig((config) => ({
          ...config,
          visuals: {
            ...config.visuals,
            showIntensity: result.data,
          },
        }))
        emitConfig(socket)
        reply?.({ ok: true })
      } catch (error) {
        console.error("Failed to set show intensity:", error)
        const message =
          error instanceof Error
            ? error.message
            : "errors:visuals.showIntensitySetFailed"

        reply?.({ error: message })
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
