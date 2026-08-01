import { EVENTS } from "@razzia/common/constants"
import {
  backgroundRefValidator,
  dialectValidator,
} from "@razzia/common/validators/visuals"
import type { SocketContext } from "@razzia/socket/handlers/types"
import {
  getGameConfig,
  updateGameConfig,
} from "@razzia/socket/services/config"
import { verifyManagerAuth } from "@razzia/socket/services/manager-auth"
import manager, { emitConfig } from "@razzia/socket/services/manager"
import {
  deleteBackgroundAsset,
  getBackgroundAssetPath,
  replaceBackgroundAsset,
  storeBackgroundAsset,
} from "@razzia/socket/services/visuals"
import fs from "fs"

export const managerSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.MANAGER.GET_CONFIG,
    manager.withAuth(socket, () => {
      emitConfig(socket)
    }),
  )

  socket.on(
    EVENTS.MANAGER.BACKGROUND_UPLOAD,
    manager.withAuth(socket, (request, callback) => {
      if (typeof callback !== "function") {
        socket.emit(
          EVENTS.MANAGER.ERROR_MESSAGE,
          "errors:visuals.backgroundUploadFailed",
        )

        return
      }

      let uploaded: ReturnType<typeof storeBackgroundAsset> | undefined =
        undefined

      try {
        const previous = getGameConfig().visuals?.background
        uploaded = replaceBackgroundAsset(previous, request)
        const background = uploaded.ref

        updateGameConfig((config) => ({
          ...config,
          visuals: {
            ...config.visuals,
            background,
          },
        }))
        emitConfig(socket)
        callback(uploaded)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "errors:visuals.backgroundUploadFailed"

        if (uploaded) {
          try {
            deleteBackgroundAsset(uploaded.ref)
          } catch (cleanupError) {
            console.error("Failed to clean up uploaded background:", cleanupError)
          }
        }

        callback({ error: message })
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER.BACKGROUND_ASSET_UPLOAD,
    manager.withAuth(socket, (request, callback) => {
      if (typeof callback !== "function") {
        socket.emit(
          EVENTS.MANAGER.ERROR_MESSAGE,
          "errors:visuals.backgroundUploadFailed",
        )

        return
      }

      try {
        const uploaded = storeBackgroundAsset(request)

        callback(uploaded)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "errors:visuals.backgroundUploadFailed"

        callback({ error: message })
      }
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

        const assetPath = getBackgroundAssetPath(result.data.path)

        if (!assetPath || !fs.existsSync(assetPath)) {
          throw new Error("errors:visuals.invalidBackgroundPath")
        }

        let previous: Parameters<typeof deleteBackgroundAsset>[0] | undefined

        updateGameConfig((config) => {
          previous = config.visuals?.background

          return {
            ...config,
            visuals: {
              ...config.visuals,
              background: result.data,
            },
          }
        })

        if (previous && previous.path !== result.data.path) {
          deleteBackgroundAsset(previous)
        }

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
        let previous: Parameters<typeof deleteBackgroundAsset>[0] | undefined

        updateGameConfig((config) => {
          previous = config.visuals?.background
          const { background: _background, ...visuals } = config.visuals ?? {}

          return {
            ...config,
            visuals: Object.keys(visuals).length ? visuals : undefined,
          }
        })

        if (previous) {
          deleteBackgroundAsset(previous)
        }

        emitConfig(socket)
        callback?.({ ok: true })
      } catch (error) {
        console.error("Failed to clear global background:", error)
        const message = "errors:visuals.backgroundClearFailed"

        callback?.({ error: message })
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
