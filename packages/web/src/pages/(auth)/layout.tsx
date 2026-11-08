import Background from "@razzia/web/components/Background"
import LanguageSwitcher from "@razzia/web/components/LanguageSwitcher"
import Loader from "@razzia/web/components/Loader"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { createFileRoute, Outlet } from "@tanstack/react-router"
import { useRef } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

const searchSchema = z.object({
  pin: z.coerce.string().optional(),
})

const AuthLayout = () => {
  const { isConnected } = useSocket()
  const { t } = useTranslation()

  // The join forms stay mounted through a reconnect: unmounting them drops a
  // half-typed PIN or name and the join acknowledgement that may arrive just
  // after the blip. Only the first connection waits behind the loader.
  const everConnected = useRef(false)

  if (isConnected) {
    everConnected.current = true
  }

  if (!everConnected.current) {
    return (
      <Background>
        <Loader className="h-23" />
        <h2 className="text-text-primary mt-2 text-center text-2xl font-bold md:text-3xl">
          {t("common:loading")}
        </h2>
      </Background>
    )
  }

  return (
    <Background>
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      {!isConnected && (
        <p
          role="status"
          className="text-text-muted absolute top-4 left-4 text-sm font-semibold"
        >
          {t("common:reconnecting")}
        </p>
      )}
      <Outlet />
    </Background>
  )
}

export const Route = createFileRoute("/(auth)")({
  component: AuthLayout,
  validateSearch: searchSchema,
})
