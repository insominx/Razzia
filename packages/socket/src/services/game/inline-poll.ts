import type { PollWithId } from "@razzia/common/types/poll"
import {
  POLL_LIMITS,
  POLL_SLUG,
  pollValidator,
} from "@razzia/common/validators/poll"
import { isSafeId } from "@razzia/socket/utils/safe"

/**
 * A poll sent with the command that starts it (a deck's slide text), checked
 * the way a stored poll is, plus a slug for its id. Anything that does not
 * pass is `null`: a client can send anything at all, and only the five named
 * fields are ever read.
 */
export const inlinePollOf = (definition: unknown): PollWithId | null => {
  if (
    typeof definition !== "object" ||
    definition === null ||
    Array.isArray(definition)
  ) {
    return null
  }

  const { id, question, options, anonymous, live } = definition as Record<
    string,
    unknown
  >

  if (typeof id !== "string" || !POLL_SLUG.test(id) || !isSafeId(id)) {
    return null
  }

  // Bounded before it is walked: a hostile client can send a very long list.
  if (!Array.isArray(options) || options.length > POLL_LIMITS.MAX_OPTIONS) {
    return null
  }

  // A field left out stays out, so the stored poll's defaults apply and a
  // sealed poll carries no `live` key at all.
  const result = pollValidator.safeParse({
    question,
    options,
    ...(anonymous === undefined ? {} : { anonymous }),
    ...(live === undefined ? {} : { live }),
  })

  return result.success ? { id, ...result.data } : null
}
