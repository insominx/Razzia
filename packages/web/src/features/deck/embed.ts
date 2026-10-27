// A lecture deck frames the host page and drives its game. The page knows it
// is embedded only when the deck frames it directly and asked for it with
// `?embed=deck`; in-app navigation drops the query, so the flag is kept for
// the frame's session.

const EMBED_KEY = "razzia_embed"
const EMBED_VALUE = "deck"

// The live course site; keep in sync with the deck's own host setting.
const DECK_ORIGINS = new Set(["https://426.csumb.workers.dev"])
// Decks served on the instructor's own machine, on any port.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"])

type FlagStorage = Pick<Storage, "getItem" | "setItem">

interface EmbedContext {
  search: string
  framed: boolean
  parentIsTop: boolean
  storage: FlagStorage | null
}

export const detectDeckEmbed = ({
  search,
  framed,
  parentIsTop,
  storage,
}: EmbedContext): boolean => {
  if (!framed || !parentIsTop) {
    return false
  }

  if (new URLSearchParams(search).get("embed") === EMBED_VALUE) {
    try {
      storage?.setItem(EMBED_KEY, EMBED_VALUE)
    } catch {
      // Refused storage only loses the flag after a later navigation.
    }

    return true
  }

  try {
    return storage?.getItem(EMBED_KEY) === EMBED_VALUE
  } catch {
    return false
  }
}

export const isAllowedDeckOrigin = (origin: string): boolean => {
  if (DECK_ORIGINS.has(origin)) {
    return true
  }

  try {
    const url = new URL(origin)

    return (
      url.protocol === "http:" &&
      LOOPBACK_HOSTS.has(url.hostname) &&
      url.origin === origin
    )
  } catch {
    return false
  }
}

const sessionStorageOrNull = (): FlagStorage | null => {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

// Read once, before the router runs and rewrites the URL.
export const IS_DECK_EMBED = detectDeckEmbed({
  search: window.location.search,
  framed: window.parent !== window,
  parentIsTop: window.parent === window.top,
  storage: sessionStorageOrNull(),
})
