import type { Status } from "@razzia/common/types/game/status"
import { z } from "zod"

// The messages a lecture deck and this page exchange with postMessage. The
// deck keeps its own copy of these shapes, so change both together.

export const DECK_SOURCE = "cst426-deck"

export const BRIDGE_SOURCE = "razzia-bridge"

export const PROTOCOL_VERSION = 1

const envelope = {
  source: z.literal(DECK_SOURCE),
  v: z.literal(PROTOCOL_VERSION),
}

const deckCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...envelope, type: z.literal("hello") }),
  z.object({
    ...envelope,
    type: z.literal("ensureGame"),
    quiz: z.string().min(1).max(200),
    // "always" closes the game it hosts and opens a fresh lobby.
    restart: z.enum(["ifFinished", "always"]).optional(),
  }),
  // Closes the lecture game; nothing opens again until the next ensureGame.
  z.object({
    ...envelope,
    type: z.literal("close"),
    quiz: z.string().min(1).max(200),
  }),
  z.object({
    ...envelope,
    type: z.literal("play"),
    question: z.number().int().min(0),
  }),
  z.object({ ...envelope, type: z.literal("leaderboard") }),
  z.object({ ...envelope, type: z.literal("finish") }),
  // Shows a played question's results again in place of the game's own
  // screen, or (null) goes back to it. The game itself does not change.
  z.object({
    ...envelope,
    type: z.literal("review"),
    question: z.number().int().min(0).nullable(),
  }),
  z.object({
    ...envelope,
    type: z.literal("visibility"),
    visible: z.boolean(),
  }),
  // The deck drives the game, so Razzia's own buttons show only when the
  // presenter asks for them (the deck's Q key).
  z.object({
    ...envelope,
    type: z.literal("controls"),
    shown: z.boolean(),
  }),
])

export type DeckCommand = z.infer<typeof deckCommandSchema>

export type RoundCommand = Extract<
  DeckCommand,
  { type: "play" | "leaderboard" | "finish" }
>

export const parseDeckCommand = (data: unknown): DeckCommand | null => {
  const result = deckCommandSchema.safeParse(data)

  return result.success ? result.data : null
}

export const isRoundCommand = (command: DeckCommand): command is RoundCommand =>
  command.type === "play" ||
  command.type === "leaderboard" ||
  command.type === "finish"

export interface BridgeState {
  connected: boolean
  loggedIn: boolean | null
  pending: "resume" | "create" | "login" | null
  reattaching: boolean
  gameId: string | null
  inviteCode: string | null
  lecture: boolean
  screen: Status | null
  answeringOpen: boolean
  question: number | null
  total: number | null
  played: number[]
  finished: boolean
  players: number
  visible: boolean
  // The question whose results are on screen for a review, and the questions
  // whose results this page has seen and can show again.
  reviewing: number | null
  reviewable: number[]
}

export type BridgeErrorCode =
  | "needsLogin"
  | "notLectureGame"
  | "quizNotFound"
  | "noPlayers"
  | "gameExpired"
  | "reattachFailed"
  | "noAck"

export type BridgeMessageBody =
  | { type: "ready" | "status"; state: BridgeState }
  | {
      type: "result"
      command: DeckCommand["type"]
      outcome: "accepted" | "queued" | "ignored"
      reason?: string
    }
  | { type: "error"; code: BridgeErrorCode; command?: DeckCommand["type"] }
  | { type: "key"; key: string; code: string; repeat: boolean }

export type BridgeMessage = BridgeMessageBody & {
  source: typeof BRIDGE_SOURCE
  v: typeof PROTOCOL_VERSION
}

// Keys that move the deck. Sent on to the deck while this frame has focus,
// so a clicker keeps working after a click into the host page.
const FORWARDED_KEYS = new Set([
  "PageDown",
  "PageUp",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  " ",
  "Home",
  "End",
  "Escape",
  "q",
  "Q",
])

const TEXT_ENTRY_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"])

interface KeyLike {
  key: string
  code: string
  repeat: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  isComposing: boolean
  target: EventTarget | null
}

const isTextEntry = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || TEXT_ENTRY_TAGS.has(target.tagName))

export const toForwardedKey = (
  event: KeyLike,
): { key: string; code: string; repeat: boolean } | null => {
  if (
    !FORWARDED_KEYS.has(event.key) ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing ||
    isTextEntry(event.target)
  ) {
    return null
  }

  return { key: event.key, code: event.code, repeat: event.repeat }
}
