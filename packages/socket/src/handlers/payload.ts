// Any client can emit any event with anything at all, whatever the event types
// say: no payload, null, or a number where an object belongs. Handlers read
// what they were sent through these and ignore what does not fit.

type Fields = Partial<Record<string, unknown>>

export const fieldsOf = (payload: unknown): Fields =>
  typeof payload === "object" && payload !== null ? (payload as Fields) : {}

export const textOf = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined

export const numberOf = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined

export const gameIdOf = (payload: unknown): string | undefined =>
  textOf(fieldsOf(payload).gameId)

// An ack the client left out, or sent as something that cannot be called.
export const ackOf = <T>(ack: T): T | undefined =>
  typeof ack === "function" ? ack : undefined

// What a client may be told about a failure: a message that is already an
// i18n key, never raw error text (file paths, quotes of config contents).
export const clientMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.startsWith("errors:")
    ? error.message
    : fallback
