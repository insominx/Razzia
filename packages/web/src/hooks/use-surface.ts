import { DEFAULT_DIALECT, type Dialect } from "@razzia/common/types/visuals"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useRouterState } from "@tanstack/react-router"
import { createContext, useContext, useLayoutEffect } from "react"

export type Surface = "stage" | "studio"

export type SurfaceDialect = Dialect

export type Register = "dark" | "light"

export interface SurfaceOverride {
  dialect?: SurfaceDialect
  surface: Surface
}

export const SurfaceOverrideContext = createContext<
  ((override: SurfaceOverride | null) => void) | null
>(null)

export const isLightRegister = (
  dialect: SurfaceDialect,
  surface: Surface,
): boolean => dialect === "stage-studio" && surface === "studio"

export const resolveRegister = (
  dialect: SurfaceDialect,
  surface: Surface,
): Register => (isLightRegister(dialect, surface) ? "light" : "dark")

export const useSurfaceOverride = ({ dialect, surface }: SurfaceOverride) => {
  const setOverride = useContext(SurfaceOverrideContext)

  if (!setOverride) {
    throw new Error("useSurfaceOverride must be used inside GameLayout")
  }

  useLayoutEffect(() => {
    setOverride({ dialect, surface })

    return () => {
      setOverride(null)
    }
  }, [dialect, setOverride, surface])
}

const applyRegister = (register: Register) => {
  document.documentElement.dataset.register = register
}

const clearRegister = () => {
  delete document.documentElement.dataset.register
}

export const useSurface = (override: SurfaceOverride | null = null) => {
  const dialect =
    useManagerStore((state) => state.config?.game.visuals?.dialect) ??
    DEFAULT_DIALECT
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const surface: Surface =
    override?.surface ??
    (pathname === "/manager" || pathname.startsWith("/manager/")
      ? "studio"
      : "stage")
  const activeDialect = override?.dialect ?? dialect
  const register = resolveRegister(activeDialect, surface)

  useLayoutEffect(() => {
    applyRegister(register)
  }, [register])

  useLayoutEffect(
    () => () => {
      clearRegister()
    },
    [],
  )
}
