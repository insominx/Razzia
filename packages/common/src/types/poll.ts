// A poll is a question with no right answer: the room votes, nobody scores.
// It runs beside the quiz in a lecture room and never touches the quiz's
// screens, points or standings.

export interface Poll {
  question: string
  options: string[]
  // An anonymous poll never tells anyone, or saves, who voted for what.
  anonymous: boolean
  // Sealed is the default (absent or false): while people vote the host's
  // screen is told only how many have voted, and the counts arrive at the
  // close. A live poll sends the host its counts as the votes come in.
  live?: boolean
}

export type PollWithId = Poll & { id: string }

// A poll typed on a slide and sent with the command that starts it. The id is
// the deck's label for it, kept in the saved result; nothing is written to the
// stored polls. It is checked on the server like any poll, and is a slug.
export type InlinePoll = Omit<PollWithId, "anonymous"> & {
  anonymous?: boolean
}

export interface PollMeta {
  id: string
  question: string
  optionCount: number
  anonymous: boolean
  live?: boolean
}

export type PollPhase = "open" | "closed"

export interface PollVoter {
  username: string
  option: number
}

// What one screen is told about the poll. A player's snapshot carries their
// own choice and, once the poll has closed, the counts. The host's carries the
// counts once the poll has closed, or while it is open if it is live; a sealed
// poll tells the host only `total`, the votes cast. Names only for a named
// poll, and only to the host.
export interface PollSnapshot {
  pollId: string
  question: string
  options: string[]
  anonymous: boolean
  phase: PollPhase
  counts?: number[]
  total?: number
  // Players only: the option this player has picked, or null.
  mine?: number | null
  // The host only, and only for a named poll.
  voters?: PollVoter[]
  // Present and true when the host's counts arrive as the votes do. A phone
  // reads it only to know whether its name shows as it votes (a sealed poll
  // shows it, a live one does not); a phone never gets counts while it is open.
  live?: true
}

// The host's running count while a poll is open. A sealed poll sends `total`
// alone, plus `arrived` when the vote is someone's first.
export interface PollTally {
  pollId: string
  counts?: number[]
  total: number
  voters?: PollVoter[]
  // The name of the player whose first vote this tally counts, so the host's
  // screen can show who has voted. Never their option. A sealed poll sends it,
  // and so does a named live one (its voters chose names); an anonymous live
  // poll never does, because the counts move with it and would tell the room
  // what that person picked.
  arrived?: string
}

export type PollOutcome =
  | "accepted"
  | "notLecture"
  | "notManager"
  | "notFound"
  | "busy"
  | "none"
  // An inline definition that failed the poll rules.
  | "invalid"
  // A deck's poll runs once per room: this one has already closed here.
  | "alreadyRan"
  // The room has closed as many polls as it reports (a runaway client).
  | "full"
  // A close or dismiss named a poll that is not the one on the stage.
  | "notCurrent"

// A poll that closed in this room: what a deck needs to know that it ran, and
// how it came out, with the wording it was asked in so the host's screen can
// show the result again. Never a name.
export interface PollDone {
  id: string
  question: string
  options: string[]
  anonymous: boolean
  live: boolean
  counts: number[]
  total: number
  // The room closed while it was open. A live room cannot report this; it is
  // for the record a closed room leaves behind.
  partial?: boolean
}

export type PollVoteOutcome =
  | "accepted"
  | "unchanged"
  | "closed"
  | "invalid"
  | "notPlayer"
  | "tooManyChanges"

// What is kept of a poll once it has closed (or once its room closed on it).
export interface PollResultRecord {
  id: string
  pollId: string
  question: string
  options: string[]
  anonymous: boolean
  date: string
  gameSubject: string
  counts: number[]
  total: number
  // Named polls only.
  voters?: PollVoter[]
  // The room closed while the poll was still open.
  partial?: boolean
}

// One closed poll, as the manager lists it.
export interface PollResultMeta {
  id: string
  pollId: string
  question: string
  date: string
  gameSubject: string
  total: number
  anonymous: boolean
  partial?: boolean
}
