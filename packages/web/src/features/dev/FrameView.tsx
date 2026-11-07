import {
  type DirectorApi,
  waitForDirector,
} from "@razzia/web/features/dev/director-api"
import type { ShowIntensity } from "@razzia/common/types/visuals"
import type { FrameMotion } from "@razzia/web/features/dev/Frame"
import type { FitView } from "@razzia/web/features/dev/fit"
import type { FixtureRef } from "@razzia/web/features/dev/fixtures"
import {
  ROOM_MODES,
  type RoomModeId,
  roomFilterId,
} from "@razzia/web/features/dev/room-wash"
import type { Surface, SurfaceDialect } from "@razzia/web/hooks/use-surface"
import { useEffect, useRef, useState } from "react"

export interface FrameSize {
  width: number
  height: number
}

interface Props {
  view: FitView
  size: FrameSize
  /** What the frame loads with. */
  fixture: FixtureRef
  /** Push later `fixture` changes into the running frame instead of ignoring them. */
  follow?: boolean
  dialect: SurfaceDialect
  surface: Surface
  /** "off" for a frame that is measured rather than watched. */
  motion?: FrameMotion
  intensity?: ShowIntensity
  room?: RoomModeId
  /** Reports the frame's API once it mounts, and `null` when it goes away. */
  onApi?: (api: DirectorApi | null) => void
  label?: string
  className?: string
}

export const frameUrl = ({
  view,
  fixture,
  dialect,
  surface,
  motion = "on",
  intensity = "full",
}: Pick<
  Props,
  "view" | "fixture" | "dialect" | "surface" | "motion" | "intensity"
>): string => {
  const params = new URLSearchParams({
    view,
    fixture: fixture.fixture,
    quiz: fixture.quizId,
    q: String(fixture.question),
    dialect,
    surface,
    motion,
    intensity,
  })

  return `/dev/frame?${params.toString()}`
}

const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current

    if (!element) {
      return
    }

    setWidth(element.clientWidth)

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

  return { ref, width }
}

/**
 * A harness frame at its true pixel size, scaled down to fit the column. The
 * iframe keeps its real viewport, so the screen lays out exactly as it would on
 * the projector or the phone; only the picture is shrunk.
 */
const FrameView = ({
  view,
  size,
  fixture,
  follow = false,
  dialect,
  surface,
  motion = "on",
  intensity = "full",
  room = "off",
  onApi,
  label,
  className,
}: Props) => {
  const { ref, width } = useWidth()
  const frame = useRef<HTMLIFrameElement>(null)
  const [api, setApi] = useState<DirectorApi | null>(null)
  const contrast = ROOM_MODES.find((mode) => mode.id === room)?.contrast ?? null
  const scale = width > 0 ? Math.min(1, width / size.width) : 0

  // The URL is the frame's identity: it reloads only for what a running frame
  // cannot change itself (surface, dialect, view). The fixture it loads with is
  // whichever was current then; later ones reach it through the API.
  const identity = `${view}|${dialect}|${surface}|${motion}|${intensity}`
  const pinned = useRef({ identity, fixture })

  if (pinned.current.identity !== identity) {
    pinned.current = { identity, fixture }
  }

  const src = frameUrl({
    view,
    fixture: pinned.current.fixture,
    dialect,
    surface,
    motion,
    intensity,
  })

  useEffect(() => {
    let cancelled = false

    setApi(null)
    waitForDirector(() => frame.current?.contentWindow).then(
      (found) => {
        if (!cancelled) {
          setApi(found)
        }
      },
      () => {
        // The frame's own page shows what went wrong.
      },
    )

    return () => {
      cancelled = true
    }
  }, [src])

  useEffect(() => {
    onApi?.(api)

    return () => {
      onApi?.(null)
    }
  }, [api, onApi])

  // The fields, not the object: callers build a new `fixture` every render, and
  // an unrelated change (the room, say) must not remount the screen.
  const { fixture: fixtureId, quizId, question } = fixture

  useEffect(() => {
    if (api && follow) {
      api.showFixture({ fixture: fixtureId, quizId, question })
    }
  }, [api, follow, fixtureId, quizId, question])

  return (
    <figure className={className}>
      {label && (
        <figcaption className="text-text-muted mb-2 text-xs font-bold tracking-widest uppercase">
          {label}
          <span className="ml-2 font-mono font-normal normal-case">
            {`${size.width}×${size.height}`}
            {scale > 0 && scale < 1 && ` at ${Math.round(scale * 100)}%`}
          </span>
        </figcaption>
      )}
      <div ref={ref} className="w-full">
        <div
          className="border-border relative overflow-hidden rounded-md border"
          style={{
            height: size.height * scale,
            width: size.width * scale,
            filter: contrast ? `url(#${roomFilterId(contrast)})` : undefined,
          }}
        >
          {scale > 0 && (
            <iframe
              key={src}
              ref={frame}
              src={src}
              title={label ?? `${view} frame`}
              width={size.width}
              height={size.height}
              className="absolute top-0 left-0 origin-top-left border-0"
              style={{ transform: `scale(${scale})` }}
            />
          )}
        </div>
      </div>
    </figure>
  )
}

export default FrameView
