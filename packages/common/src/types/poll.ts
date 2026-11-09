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
  // The host only: present and true when counts arrive as the votes do.
  live?: true
}

// The host's running count while a poll is open. A sealed poll sends `total`
// alone.
export interface PollTally {
  pollId: string
  counts?: number[]
  total: number
  voters?: PollVoter[]
}

export type PollOutcome =
  | "accepted"
  | "notLecture"
  | "notManager"
  | "notFound"
  | "busy"
  | "none"

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
