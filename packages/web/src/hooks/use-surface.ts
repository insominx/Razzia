import { DEFAULT_DIALECT, type Dialect } from "@razzia/common/types/visuals"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useRouterState } from "@tanstack/react-router"
import {
  createContext,
  useContext,
  useLayoutEffect,
  useSyncExternalStore,
} from "react"

export type Surface = "stage" | "studio"

export type SurfaceDialect = Dialect

export type Register = "dark" | "light"

export interface SurfaceOverride {
  dialect?: SurfaceDialect
  surface: Surface
  /** Scale the page like a slide. Defaults to on for the host's game page. */
  stage?: boolean
}

/**
 * The stage scale composes the host screen at the projector's own size, so it
 * only applies to a landscape window a projector could plausibly be: a narrow
 * window falls back to the phone layout instead of a shrunken slide.
 */
export const STAGE_QUERY = "(min-width: 1024px) and (orientation: landscape)"

export const isHostGamePath = (pathname: string): boolean =>
  pathname.startsWith("/party/manager/")

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

export const useSurfaceOverride = ({
  dialect,
  surface,
  stage,
}: SurfaceOverride) => {
  const setOverride = useContext(SurfaceOverrideContext)

  if (!setOverride) {
    throw new Error("useSurfaceOverride must be used inside GameLayout")
  }

  useLayoutEffect(() => {
    setOverride({ dialect, surface, stage })

    return () => {
      setOverride(null)
    }
  }, [dialect, setOverride, stage, surface])
}

const applyRegister = (register: Register) => {
  document.documentElement.dataset.register = register
}

const clearRegister = () => {
  delete document.documentElement.dataset.register
}

const subscribeMatch = (query: string) => (notify: () => void) => {
  if (typeof window.matchMedia !== "function") {
    return () => undefined
  }

  const list = window.matchMedia(query)

  list.addEventListener("change", notify)

  return () => {
    list.removeEventListener("change", notify)
  }
}

const useMatchMedia = (query: string): boolean =>
  useSyncExternalStore(
    (notify) => subscribeMatch(query)(notify),
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
    () => false,
  )

const applyStage = (stage: boolean) => {
  if (stage) {
    document.documentElement.dataset.stage = ""
  } else {
    delete document.documentElement.dataset.stage
  }
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
  const roomy = useMatchMedia(STAGE_QUERY)
  const stage = (override?.stage ?? isHostGamePath(pathname)) && roomy

  useLayoutEffect(() => {
    applyRegister(register)
  }, [register])

  useLayoutEffect(() => {
    applyStage(stage)
  }, [stage])

  useLayoutEffect(
    () => () => {
      clearRegister()
      applyStage(false)
    },
    [],
  )
}
