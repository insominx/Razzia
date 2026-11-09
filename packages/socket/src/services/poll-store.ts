import type {
  PollMeta,
  PollResultMeta,
  PollResultRecord,
  PollWithId,
} from "@razzia/common/types/poll"
import {
  pollResultValidator,
  pollValidator,
} from "@razzia/common/validators/poll"
import {
  assertSafeId,
  getConfigPath,
  readJsonFile,
  writeFileAtomic,
} from "@razzia/socket/services/config"
import { isSafeId, ItemNotFoundError, logSafe } from "@razzia/socket/utils/safe"
import fs from "fs"
import { nanoid } from "nanoid"

// Poll definitions live in `config/polls/<id>.json`, apart from the quizzes.
// This module keeps them out of `services/config`, and calls nothing from it
// while it loads, so the many tests that replace that module are unaffected.

const POLLS_DIR = "polls"

// A file system may answer "LUNCH" with lunch.json (Windows and macOS ignore case,
// Linux does not). An id is the file's own name everywhere, so a poll cannot run, or be
// recorded, under a spelling that is not its name.
const hasFile = (dir: string, file: string): boolean => {
  try {
    return fs.readdirSync(dir).includes(file)
  } catch {
    return false
  }
}

const parsePoll = (data: unknown, label: string) => {
  const result = pollValidator.safeParse(data)

  if (!result.success) {
    console.warn(
      `Invalid poll config ${logSafe(label)}:`,
      result.error.issues[0],
    )

    return null
  }

  return result.data
}

/** One poll by id. Throws when it is missing or invalid. */
export const getPollById = (id: string): PollWithId => {
  assertSafeId(id)
  const filePath = getConfigPath(`${POLLS_DIR}/${id}.json`)

  if (!hasFile(getConfigPath(POLLS_DIR), `${id}.json`)) {
    throw new Error(`Poll ${logSafe(id)} not found`)
  }

  const poll = parsePoll(readJsonFile(filePath), id)

  if (!poll) {
    throw new Error(`Invalid poll ${logSafe(id)}`)
  }

  return { id, ...poll }
}

const getPolls = (): PollWithId[] => {
  const dir = getConfigPath(POLLS_DIR)

  if (!fs.existsSync(dir)) {
    return []
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      const id = file.slice(0, -".json".length)

      try {
        // One bad file is skipped; it must not hide every other poll.
        const poll = isSafeId(id)
          ? parsePoll(readJsonFile(getConfigPath(`${POLLS_DIR}/${file}`)), file)
          : null

        return poll ? [{ id, ...poll }] : []
      } catch (error) {
        console.warn(`Unreadable poll config "${file}":`, error)

        return []
      }
    })
}

/**
 * The polls the host can pick from. It never throws: the manager's config also
 * carries the quizzes, and a problem with the poll folder must not stop it
 * arriving.
 */
export const getPollMeta = (): PollMeta[] => {
  try {
    return getPolls()
      .map(({ id, question, options, anonymous, live }) => ({
        id,
        question,
        optionCount: options.length,
        anonymous,
        ...(live ? { live: true } : {}),
      }))
      .sort((a, b) => a.question.localeCompare(b.question))
  } catch (error) {
    console.error("Failed to read the polls:", error)

    return []
  }
}

// A new poll is named by the editor that makes it, once, and every save of it
// carries that name. Saving is then the same whether the poll exists yet or
// not, so a save sent again (a lost reply, a double click, a restart in
// between) lands on the same file and can never make a second poll.
const NEW_POLL_ID = /^[A-Za-z0-9_-]{8,64}$/u

const validated = (data: unknown) => {
  const result = pollValidator.safeParse(data)

  if (!result.success) {
    // The message is an i18n key (`errors:poll.*`) the host's screen can show.
    throw new Error(result.error.issues[0].message)
  }

  return result.data
}

const writePoll = (id: string, poll: unknown) => {
  fs.mkdirSync(getConfigPath(POLLS_DIR), { recursive: true })
  writeFileAtomic(
    getConfigPath(`${POLLS_DIR}/${id}.json`),
    JSON.stringify(poll, null, 2),
  )
}

/** Stores a poll under the name the editor chose, or a fresh one. */
export const savePoll = (data: unknown, requestedId?: unknown): string => {
  const poll = validated(data)

  if (
    requestedId !== undefined &&
    !(typeof requestedId === "string" && NEW_POLL_ID.test(requestedId))
  ) {
    throw new Error("errors:poll.failedToSave")
  }

  const id = requestedId ?? `poll-${nanoid(12)}`

  writePoll(id, poll)

  return id
}

/** Replaces a stored poll. Throws when it is not there. */
export const updatePoll = (id: string, data: unknown): string => {
  const poll = validated(data)

  assertSafeId(id)

  if (!hasFile(getConfigPath(POLLS_DIR), `${id}.json`)) {
    throw new Error("errors:poll.notFound")
  }

  writePoll(id, poll)

  return id
}

/** Removes a stored poll. A poll already gone is an `ItemNotFoundError`. */
export const deletePoll = (id: string): void => {
  assertSafeId(id)

  const filePath = getConfigPath(`${POLLS_DIR}/${id}.json`)

  if (!hasFile(getConfigPath(POLLS_DIR), `${id}.json`)) {
    throw new ItemNotFoundError(`Poll ${logSafe(id)} not found`)
  }

  fs.unlinkSync(filePath)
}

// ── What closed polls left behind ────────────────────────────────────────────

const RESULTS_DIR = "poll-results"

/**
 * Keeps a closed poll's result in `config/poll-results/`, apart from the quiz
 * results. Returns `false` when it could not be kept, so the caller can offer
 * it again (a full disk is not a reason to lose a lecture's poll).
 */
export const savePollResult = (record: PollResultRecord): boolean => {
  try {
    // Through the same rules as a read, so an anonymous poll can never write
    // names whatever it was given.
    const parsed = pollResultValidator.safeParse(record)

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message)
    }

    assertSafeId(record.id)
    fs.mkdirSync(getConfigPath(RESULTS_DIR), { recursive: true })
    writeFileAtomic(
      getConfigPath(`${RESULTS_DIR}/${record.id}.json`),
      JSON.stringify(parsed.data, null, 2),
    )

    return true
  } catch (error) {
    console.error("Failed to save poll result:", error)

    return false
  }
}

const readPollResult = (file: string): PollResultRecord => {
  const result = pollResultValidator.safeParse(
    readJsonFile(getConfigPath(`${RESULTS_DIR}/${file}`)),
  )

  if (!result.success) {
    throw new Error(`Invalid poll result ${logSafe(file)}`)
  }

  // The id is the file name: that is what get and delete resolve.
  return { ...result.data, id: file.slice(0, -".json".length) }
}

const timeOf = (date: string): number => {
  const time = new Date(date).getTime()

  return Number.isNaN(time) ? 0 : time
}

/**
 * The closed polls the host can look back on, newest first. It never throws,
 * for the same reason `getPollMeta` does not.
 */
export const getPollResultsMeta = (): PollResultMeta[] => {
  try {
    const dir = getConfigPath(RESULTS_DIR)

    if (!fs.existsSync(dir)) {
      return []
    }

    return fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .flatMap((file) => {
        try {
          if (!isSafeId(file.slice(0, -".json".length))) {
            return []
          }

          const {
            id,
            pollId,
            question,
            date,
            gameSubject,
            total,
            anonymous,
            partial,
          } = readPollResult(file)

          return [
            {
              id,
              pollId,
              question,
              date,
              gameSubject,
              total,
              anonymous,
              ...(partial ? { partial } : {}),
            },
          ]
        } catch (error) {
          console.warn(`Unreadable poll result "${file}":`, error)

          return []
        }
      })
      .sort((a, b) => timeOf(b.date) - timeOf(a.date))
  } catch (error) {
    console.error("Failed to read the poll results:", error)

    return []
  }
}

/** One closed poll's result. Throws when it is missing or invalid. */
export const getPollResultById = (id: string): PollResultRecord => {
  assertSafeId(id)

  if (!hasFile(getConfigPath(RESULTS_DIR), `${id}.json`)) {
    throw new Error(`Poll result ${logSafe(id)} not found`)
  }

  return readPollResult(`${id}.json`)
}

/** Removes a closed poll's result. One already gone is an `ItemNotFoundError`. */
export const deletePollResult = (id: string): void => {
  assertSafeId(id)

  const filePath = getConfigPath(`${RESULTS_DIR}/${id}.json`)

  if (!hasFile(getConfigPath(RESULTS_DIR), `${id}.json`)) {
    throw new ItemNotFoundError(`Poll result ${logSafe(id)} not found`)
  }

  fs.unlinkSync(filePath)
}
