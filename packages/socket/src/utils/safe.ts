// Web clients send a uuid; anything else is a tool or an attacker.
const CLIENT_ID_PATTERN = /^[\w-]{8,64}$/

export const isValidClientId = (value: unknown): value is string =>
  typeof value === "string" && CLIENT_ID_PATTERN.test(value)

// Socket.IO middleware: a handshake without a sane clientId never connects, so
// no handler ever sees an undefined, oversized or log-forging identity.
export const requireClientId = (
  socket: { handshake: { auth?: Record<string, unknown> } },
  next: (_error?: Error) => void,
) => {
  if (!isValidClientId(socket.handshake.auth?.clientId)) {
    next(new Error("unauthorized"))

    return
  }

  next()
}

// Only i18n keys are meant for the browser; fs and parser errors carry
// absolute paths and OS details, so they are logged and replaced.
export const publicErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.startsWith("errors:")
    ? error.message
    : fallback

// Deleting something that is already gone is not a failure for the caller.
export class ItemNotFoundError extends Error {}

// Ids end up in file paths: one plain file name, never a path.
export const isSafeId = (id: unknown): id is string =>
  typeof id === "string" &&
  id.length > 0 &&
  id.length <= 200 &&
  !id.includes("..") &&
  !/[/\\:\0]/.test(id)

// Client-supplied text in a log line must not forge extra lines.
export const logSafe = (value: unknown): string =>
  JSON.stringify(String(value).slice(0, 80))
