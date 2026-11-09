import { z } from "zod"

export const POLL_LIMITS = {
  QUESTION: 500,
  OPTION: 200,
  MIN_OPTIONS: 2,
  MAX_OPTIONS: 6,
} as const

const text = (max: number, emptyKey: string) =>
  z.string().trim().min(1, emptyKey).max(max, "errors:poll.textTooLong")

export const pollValidator = z
  .object({
    question: text(POLL_LIMITS.QUESTION, "errors:poll.questionEmpty"),
    options: z
      .array(text(POLL_LIMITS.OPTION, "errors:poll.optionEmpty"))
      .min(POLL_LIMITS.MIN_OPTIONS, "errors:poll.tooFewOptions")
      .max(POLL_LIMITS.MAX_OPTIONS, "errors:poll.tooManyOptions"),
    // Votes are private unless the author says otherwise.
    anonymous: z.boolean().default(true),
    // Results are sealed until the close unless the author asks to show them
    // as the votes come in. Absent means sealed.
    live: z.boolean().optional(),
  })
  .superRefine((poll, ctx) => {
    const seen = new Set<string>()

    for (const option of poll.options) {
      const key = option.toLocaleLowerCase()

      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "errors:poll.duplicateOption",
        })

        return
      }

      seen.add(key)
    }
  })

export type PollValidated = z.infer<typeof pollValidator>

const voterValidator = z.object({
  username: z.string(),
  option: z.number().int().min(0),
})

/**
 * What a closed poll leaves on disk. An anonymous poll never keeps who voted
 * for what, whatever a file says: reading one drops any names.
 */
export const pollResultValidator = z
  .object({
    id: z.string().min(1),
    pollId: z.string().min(1),
    question: z.string(),
    options: z.array(z.string()).min(1),
    anonymous: z.boolean(),
    date: z.string(),
    gameSubject: z.string(),
    counts: z.array(z.number().int().min(0)),
    total: z.number().int().min(0),
    voters: z.array(voterValidator).optional(),
    partial: z.boolean().optional(),
  })
  .transform(({ voters, ...record }) =>
    record.anonymous || !voters ? record : { ...record, voters },
  )

export type PollResultValidated = z.infer<typeof pollResultValidator>
