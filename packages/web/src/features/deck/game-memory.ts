// Which game this frame hosts for each lecture quiz, so a deck reload resumes
// it. Kept in the frame's own storage, which the browser partitions by the
// deck's site.

const MEMORY_KEY = "razzia_deck_games"
const MAX_AGE_MS = 24 * 60 * 60 * 1_000

type MemoryStorage = Pick<Storage, "getItem" | "setItem">

interface Remembered {
  gameId: string
  at: number
}

type Memory = Partial<Record<string, Remembered>>

const isRemembered = (value: unknown): value is Remembered =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Partial<Remembered>).gameId === "string" &&
  typeof (value as Partial<Remembered>).at === "number"

const readMemory = (storage: MemoryStorage | null, now: number): Memory => {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(MEMORY_KEY) ?? "{}")

    if (typeof parsed !== "object" || parsed === null) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, entry]) => isRemembered(entry) && now - entry.at < MAX_AGE_MS,
      ),
    ) as Memory
  } catch {
    return {}
  }
}

const writeMemory = (storage: MemoryStorage | null, memory: Memory) => {
  try {
    storage?.setItem(MEMORY_KEY, JSON.stringify(memory))
  } catch {
    // Without storage a reload simply starts a new game.
  }
}

interface MemoryAccess {
  storage: MemoryStorage | null
  quiz: string
  now?: number
}

export const recallGame = ({
  storage,
  quiz,
  now = Date.now(),
}: MemoryAccess): string | null =>
  readMemory(storage, now)[quiz]?.gameId ?? null

export const rememberGame = ({
  storage,
  quiz,
  gameId,
  now = Date.now(),
}: MemoryAccess & { gameId: string }) => {
  writeMemory(storage, {
    ...readMemory(storage, now),
    [quiz]: { gameId, at: now },
  })
}

export const forgetGame = ({
  storage,
  quiz,
  now = Date.now(),
}: MemoryAccess) => {
  const memory = readMemory(storage, now)

  writeMemory(
    storage,
    Object.fromEntries(Object.entries(memory).filter(([key]) => key !== quiz)),
  )
}

// Some browsers throw on any storage access when site data is blocked.
export const localStorageOrNull = (): MemoryStorage | null => {
  try {
    return localStorage
  } catch {
    return null
  }
}
