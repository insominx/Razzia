import { Component, type ErrorInfo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  children: ReactNode
  /** The screen is tried again when this changes, e.g. on the next status. */
  resetKey?: unknown
  /** Asks the server for the game's current state, once a screen has thrown. */
  onRecover: () => void
}

interface State {
  failed: boolean
  resetKey: unknown
}

const RECOVER_INTERVAL_MS = 3000

const Fallback = () => {
  const { t } = useTranslation()

  return (
    <div role="alert" className="flex flex-col items-center gap-1 text-center">
      <p className="text-text-primary text-xl font-bold">
        {t("errors:route.title")}
      </p>
      <p className="text-text-muted text-sm">{t("common:reconnecting")}</p>
    </div>
  )
}

/**
 * Keeps a screen that throws while rendering (say, a status payload missing a
 * field) from reaching the root error page, which unmounts the socket
 * provider and so drops the connection mid-game. The screen is replaced by a
 * small notice, the server is asked for the game's state again, and the
 * screen is retried when the next status arrives.
 */
class GameScreenBoundary extends Component<Props, State> {
  state: State = { failed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  static getDerivedStateFromProps(props: Props, state: State) {
    if (props.resetKey !== state.resetKey) {
      return { failed: false, resetKey: props.resetKey }
    }

    return null
  }

  private lastRecover = 0

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Game screen failed:", error, info.componentStack)

    // A state that always throws must not turn into a request loop.
    const now = Date.now()

    if (now - this.lastRecover >= RECOVER_INTERVAL_MS) {
      this.lastRecover = now
      this.props.onRecover()
    }
  }

  render() {
    return this.state.failed ? <Fallback /> : this.props.children
  }
}

export default GameScreenBoundary
