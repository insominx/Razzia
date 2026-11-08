import { EVENTS } from "@razzia/common/constants"
import {
  backgroundRefValidator,
  dialectValidator,
  showIntensityValidator,
  soundThemeValidator,
} from "@razzia/common/validators/visuals"
import { ackOf, clientMessage, fieldsOf } from "@razzia/socket/handlers/payload"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { getGameConfig, updateGameConfig } from "@razzia/socket/services/config"
import {
  authAddressThrottle,
  authThrottle,
  trustedHosts,
} from "@razzia/socket/services/auth-throttle"
import { verifyManagerAuth } from "@razzia/socket/services/manager-auth"
import manager, {
  emitConfig,
  emitConfigOrError,
  emitConfigSafely,
} from "@razzia/socket/services/manager"
import Registry from "@razzia/socket/services/registry"
import {
  clearGlobalBackground,
  setGlobalBackground,
} from "@razzia/socket/services/visuals"

export const managerSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.MANAGER.GET_CONFIG,
    manager.withAuth(socket, () => {
      emitConfigOrError(socket)
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
        reply?.({ ok: true })
        emitConfigSafely(socket)
      } catch (error) {
        console.error("Failed to set global background:", error)
        reply?.({
          error: clientMessage(error, "errors:visuals.backgroundSetFailed"),
        })
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER.GLOBAL_BACKGROUND_CLEAR,
    manager.withAuth(socket, (callback) => {
      const reply = ackOf(callback)

      try {
        clearGlobalBackground()
        reply?.({ ok: true })
        emitConfigSafely(socket)
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
        reply?.({ ok: true })
        emitConfigSafely(socket)
      } catch (error) {
        console.error("Failed to set dialect:", error)
        reply?.({
          error: clientMessage(error, "errors:visuals.dialectSetFailed"),
        })
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
        reply?.({ ok: true })
        emitConfigSafely(socket)
      } catch (error) {
        console.error("Failed to set sound theme:", error)
        reply?.({
          error: clientMessage(error, "errors:visuals.soundThemeSetFailed"),
        })
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
        reply?.({ ok: true })
        emitConfigSafely(socket)
      } catch (error) {
        console.error("Failed to set show intensity:", error)
        reply?.({
          error: clientMessage(error, "errors:visuals.showIntensitySetFailed"),
        })
      }
    }),
  )

  // Logging out takes the games this socket hosts out of its hands: they wait
  // for a manager who logs in again and reconnects, like after a dropped
  // connection.
  socket.on(EVENTS.MANAGER.LOGOUT, () => {
    manager.logout(socket)

    const registry = Registry.getInstance()

    registry.getGamesByManagerSocketId(socket.id).forEach((game) => {
      game.setManagerDisconnected()
      registry.markGameAsEmpty(game)
    })
  })

  socket.on(EVENTS.MANAGER.AUTH, (password) => {
    // A class shares one address: the client is held to a tight limit, the
    // address to a loose one. A client that has logged in as the host before
    // is exempt from the address, so nobody can lock the teacher out.
    const clientId = String(socket.handshake.auth.clientId)
    const known =
      trustedHosts.has(clientId) || manager.isLoggedByClientId(clientId)
    const clientKeys = [`client:${clientId}`]
    const addressKeys = known ? [] : [`address:${socket.handshake.address}`]

    if (
      Math.max(
        authThrottle.retryAfter(clientKeys),
        authAddressThrottle.retryAfter(addressKeys),
      ) > 0
    ) {
      socket.emit(
        EVENTS.MANAGER.ERROR_MESSAGE,
        "errors:manager.tooManyAttempts",
      )

      return
    }

    try {
      const config = getGameConfig()
      const auth = verifyManagerAuth(password, config)

      if (!auth.ok) {
        // A server that cannot check the password is not the client's miss.
        if (auth.error === "errors:manager.invalidPassword") {
          authThrottle.fail(clientKeys)
          authAddressThrottle.fail(addressKeys)
        }

        socket.emit(EVENTS.MANAGER.ERROR_MESSAGE, auth.error)

        return
      }

      authThrottle.succeed(clientKeys)
      authAddressThrottle.succeed([`address:${socket.handshake.address}`])
      trustedHosts.add(clientId)
      manager.login(socket)
      emitConfig(socket)
    } catch (error) {
      console.error("Failed to read game config:", error)
      socket.emit(
        EVENTS.MANAGER.ERROR_MESSAGE,
        "errors:manager.failedToReadConfig",
      )
    }
  })
}
