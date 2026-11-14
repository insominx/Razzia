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

const pollTarget = {
  pollId: z.string().max(64).optional(),
  gameId: z.string().max(200).optional(),
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
  // What is behind the quiz: its own night-sky backdrop ("own", the default),
  // or nothing, so the slide the page sits on shows through ("slide").
  z.object({
    ...envelope,
    type: z.literal("backdrop"),
    mode: z.enum(["own", "slide"]),
  }),
  // The deck draws the sound button, since the frame takes no clicks while the
  // deck drives it. Either field may come alone; a volume also unmutes, as the
  // slider does.
  z.object({
    ...envelope,
    type: z.literal("sound"),
    muted: z.boolean().optional(),
    volume: z.number().min(0).max(1).optional(),
  }),
  // A poll typed on the slide, started in the lobby or between questions. The
  // server holds the rules (limits, a slug for the id) and answers `invalid`
  // to a definition that fails them; this is only the shape a message needs
  // to be read at all. Poll commands are never queued.
  z.object({
    ...envelope,
    type: z.literal("startPoll"),
    poll: z.object({
      id: z.string(),
      question: z.string(),
      options: z.array(z.string()).max(20),
      anonymous: z.boolean().optional(),
      live: z.boolean().optional(),
    }),
  }),
  // Ends voting and shows the result. A deck names the poll it means
  // (`pollId`) and the game it saw (`gameId`), so a late one cannot touch the
  // next poll or the next room; either one that does not match answers
  // `notCurrent` and changes nothing.
  z.object({ ...envelope, type: z.literal("closePoll"), ...pollTarget }),
  // Takes the result away and gives the room back to the quiz.
  z.object({ ...envelope, type: z.literal("dismissPoll"), ...pollTarget }),
  // Shows a poll that closed in this room again, as it was left, in place of
  // the stage, or (null) stops. Only this page changes: the room, its stage and
  // the phones do not.
  z.object({
    ...envelope,
    type: z.literal("reviewPoll"),
    id: z.string().max(64).nullable(),
  }),
])

export type DeckCommand = z.infer<typeof deckCommandSchema>

export type RoundCommand = Extract<
  DeckCommand,
  { type: "play" | "leaderboard" | "finish" }
>

export type PollCommand = Extract<
  DeckCommand,
  { type: "startPoll" | "closePoll" | "dismissPoll" }
>

export const parseDeckCommand = (data: unknown): DeckCommand | null => {
  const result = deckCommandSchema.safeParse(data)

  return result.success ? result.data : null
}

export const isRoundCommand = (command: DeckCommand): command is RoundCommand =>
  command.type === "play" ||
  command.type === "leaderboard" ||
  command.type === "finish"

// A start that is not even shaped like one (a field of the wrong type, a list
// that is far too long) is dropped by `parseDeckCommand`. The deck still gets an
// answer, so it can say why nothing opened; other malformed messages stay
// unanswered, as before.
export const isPollStart = (data: unknown): boolean => {
  const fields =
    typeof data === "object" ? (data as Record<string, unknown> | null) : null

  return (
    fields?.source === DECK_SOURCE &&
    fields.v === PROTOCOL_VERSION &&
    fields.type === "startPoll"
  )
}

export const isPollCommand = (command: DeckCommand): command is PollCommand =>
  command.type === "startPoll" ||
  command.type === "closePoll" ||
  command.type === "dismissPoll"

// What this build can do, so a deck can tell an older Razzia by its absence.
// A name is listed only once it is built.
// `pollReview`: reviewPoll, named close and dismiss, a deck poll that runs
// once per room and takes the stage straight from a closed result.
// `sound`: the `sound` command and `BridgeState.sound`; Razzia's own sound
// button then shows only with its other controls (the deck's Q key).
export const FEATURES: readonly string[] = [
  "poll",
  "pollInline",
  "pollReview",
  "sound",
]

// The poll showing on the stage. Never a name, whatever the poll.
export interface BridgePoll {
  id: string
  phase: "open" | "closed"
  anonymous: boolean
  live: boolean
  // Votes cast. Players are already in `BridgeState.players`.
  voted: number
  // Present once the poll has closed, or while it is open if it is live.
  counts?: number[]
}

// A poll that closed in this room.
export interface BridgePollDone {
  id: string
  counts: number[]
  total: number
  partial?: boolean
}

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
  // Current-room presence; absent until the host has an authoritative roster.
  connectedPlayers?: number
  visible: boolean
  // The question whose results are on screen for a review, and the questions
  // whose results this page has seen and can show again.
  reviewing: number | null
  reviewable: number[]
  // The closed poll whose result is shown again (`reviewPoll`), or null.
  reviewingPoll: string | null
  // Always sent by this build; an older one sends none of the three, which is
  // how a deck tells them apart.
  features: string[]
  // Null when polls are supported and none is showing.
  poll: BridgePoll | null
  // Polls that closed in this room, oldest first, at most 50.
  pollsDone: BridgePollDone[]
  // The host's sound setting, for the deck's own button. Not the silence the
  // deck asks for while it hides this page.
  sound: { muted: boolean; volume: number }
}

export type BridgeErrorCode =
  | "needsLogin"
  | "notLectureGame"
  | "quizNotFound"
  | "noPlayers"
  | "gameExpired"
  | "reattachFailed"
  | "pollInvalid"
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

// A dialog (the kick confirmation) owns the keys while it is open: Escape
// closes it and Space presses its buttons. The poll frame is a dialog too, but
// it has no keys of its own and the deck drives it, so it hands them back
// (`data-deck-keys`); otherwise Q and the forward keys would stop reaching the
// deck after a click in the frame.
const isInDialog = (target: EventTarget | null): boolean => {
  const dialog =
    target instanceof Element
      ? target.closest('[role="dialog"],[role="alertdialog"]')
      : null

  return dialog !== null && !dialog.hasAttribute("data-deck-keys")
}

export const toForwardedKey = (
  event: KeyLike,
): { key: string; code: string; repeat: boolean } | null => {
  if (
    !FORWARDED_KEYS.has(event.key) ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing ||
    isTextEntry(event.target) ||
    isInDialog(event.target)
  ) {
    return null
  }

  return { key: event.key, code: event.code, repeat: event.repeat }
}
