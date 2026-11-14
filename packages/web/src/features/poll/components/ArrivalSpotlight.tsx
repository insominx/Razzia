import { score } from "@razzia/web/features/game/audio/score"
import { useCalmVisuals } from "@razzia/web/features/game/hooks/use-show-intensity"
import {
  type PollArrival,
  usePollStore,
} from "@razzia/web/features/poll/stores/poll"
import clsx from "clsx"
import { Check } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

// How long a name holds the spotlight.
export const ARRIVAL_HOLD_MS = 700

// How soon a name gives way to one already waiting.
export const ARRIVAL_FAST_MS = 280

// A backlog this long folds into one name and "+N".
export const ARRIVAL_FOLD_AT = 3

// How long a name takes to leave before it is dropped.
const LEAVE_MS = 420

// The names on the trail.
export const TRAIL_KEPT = 12

// The key "everyone's in" is shown under; an arrival's is its own number.
const ALL_IN_KEY = -1

interface TrailName {
  key: number
  name: string
}

interface Shown {
  key: number
  label: string
  // The names folded in behind it.
  more: number
  // A name that may join the trail when the next one takes its place.
  trails: boolean
  all: boolean
  leaving: boolean
}

interface Props {
  // Everyone connected has voted.
  allIn: boolean
  // How many are in the room, for each vote's step up the scale; null when
  // the screen does not know.
  room: number | null
}

/**
 * The newest voter's name, large, in the room left under the options, with a
 * check and a note a step higher for each share of the room; the names before
 * it run along a trail beneath. A burst folds into one name and "+N" so the
 * screen never falls behind the room. An anonymous live poll's arrivals carry
 * no name (its counts move with them), so they show as a vote and leave no
 * trail.
 * When everyone is in it says so, and nothing more: no burst.
 *
 * It shows only arrivals that come after it appears: a reloaded screen does
 * not replay the room.
 */
const ArrivalSpotlight = ({ allIn, room }: Props) => {
  const arrivals = usePollStore((state) => state.arrivals)
  const calm = useCalmVisuals()
  const { t } = useTranslation()
  const [shown, setShown] = useState<Shown[]>([])
  const [trail, setTrail] = useState<TrailName[]>([])

  const seen = useRef(arrivals.at(-1)?.seq ?? 0)
  const queue = useRef<PollArrival[]>([])
  const busy = useRef(false)
  const current = useRef<Shown | null>(null)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const latest = useRef({ allIn, room, calm, t })

  useEffect(() => {
    latest.current = { allIn, room, calm, t }
  })

  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      fn()
    }, ms)

    timers.current.add(timer)
  }

  const addToTrail = (names: TrailName[]) => {
    if (names.length > 0) {
      setTrail((before) => [...names, ...before].slice(0, TRAIL_KEPT))
    }
  }

  // The name on screen steps aside for `next`: a named one joins the trail,
  // and it leaves (at once in calm, where nothing moves).
  const replace = (next: Omit<Shown, "leaving">) => {
    const before = current.current
    const item: Shown = { ...next, leaving: false }

    current.current = item

    if (before?.trails) {
      addToTrail([{ key: before.key, name: before.label }])
    }

    if (!before || latest.current.calm || before.key === item.key) {
      setShown([item])

      return
    }

    const gone: Shown = { ...before, leaving: true }

    setShown([gone, item])
    later(() => {
      setShown((items) =>
        items.filter((each) => each.key !== gone.key || !each.leaving),
      )
    }, LEAVE_MS)
  }

  const showAllIn = () => {
    if (current.current?.all) {
      return
    }

    replace({
      key: ALL_IN_KEY,
      label: latest.current.t("poll:arrival.everyone"),
      more: 0,
      trails: false,
      all: true,
    })
  }

  const pump = () => {
    const next = queue.current.shift()

    if (!next) {
      busy.current = false

      if (latest.current.allIn) {
        showAllIn()
      }

      return
    }

    busy.current = true

    const extra =
      queue.current.length >= ARRIVAL_FOLD_AT ? queue.current.splice(0) : []
    const last = extra.at(-1) ?? next
    const size = latest.current.room

    replace({
      key: next.seq,
      label: next.name ?? latest.current.t("poll:arrival.someone"),
      more: extra.length,
      trails: next.name !== null,
      all: false,
    })
    // The folded names go straight onto the trail, newest first.
    addToTrail(
      extra
        .flatMap(({ seq, name }) => (name === null ? [] : [{ key: seq, name }]))
        .reverse(),
    )
    score.cue({
      cue: "vote",
      share: size ? Math.min(1, last.total / size) : 0,
    })
    // A name with others waiting behind it gives way sooner.
    later(pump, queue.current.length > 0 ? ARRIVAL_FAST_MS : ARRIVAL_HOLD_MS)
  }

  // New arrivals join the queue; an idle screen starts it.
  useEffect(() => {
    const fresh = arrivals.filter((arrival) => arrival.seq > seen.current)

    if (fresh.length === 0) {
      return
    }

    seen.current = fresh[fresh.length - 1].seq
    queue.current.push(...fresh)

    if (!busy.current) {
      pump()
    }
    // `pump` reads everything else through refs.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivals])

  // Everyone in with nothing queued says so now; someone joining takes it back.
  useEffect(() => {
    if (busy.current) {
      return
    }

    if (allIn) {
      showAllIn()
    } else if (current.current?.all) {
      current.current = null
      setShown([])
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [allIn])

  useEffect(() => {
    const pending = timers.current

    return () => {
      for (const timer of pending) {
        clearTimeout(timer)
      }

      pending.clear()
    }
  }, [])

  return (
    <div
      data-poll-arrivals
      className="rz-arrivals stage:gap-7 flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-3 overflow-hidden"
    >
      <div className="rz-arrival-now grid w-full place-items-center">
        {shown.map((item) => (
          <p
            key={item.key}
            data-arrival={item.all ? "all" : "vote"}
            data-leaving={item.leaving ? "" : undefined}
            data-calm={calm ? "" : undefined}
            className={clsx(
              "rz-arrival-name stage:gap-6 stage:text-[5rem] col-start-1 row-start-1 flex max-w-full min-w-0 items-center gap-3 text-3xl leading-tight font-bold",
              item.all ? "text-brand" : "text-text-primary",
            )}
          >
            <span className="rz-arrival-tick bg-brand text-on-accent stage:size-[5.5rem] grid size-10 shrink-0 place-items-center rounded-full">
              <Check
                aria-hidden="true"
                className="stage:size-14 size-6 stroke-3"
              />
            </span>
            {/* A name is at most 20 characters, which fits the stage; a narrow
                host window wraps it. Not truncated: the clip would cut the
                name's glow into a box. */}
            <span className="min-w-0 break-words">{item.label}</span>
            {item.more > 0 && (
              <span className="text-brand stage:text-[3.5rem] shrink-0 text-2xl">
                {t("poll:arrival.more", { count: item.more })}
              </span>
            )}
          </p>
        ))}
      </div>

      {trail.length > 0 && (
        <p
          data-poll-trail
          className="rz-arrival-trail text-text-muted stage:gap-9 stage:text-[2.6875rem] flex w-full justify-center gap-5 overflow-hidden text-base font-semibold whitespace-nowrap"
        >
          {trail.map(({ key, name }) => (
            <span key={key}>{name}</span>
          ))}
        </p>
      )}
    </div>
  )
}

export default ArrivalSpotlight
