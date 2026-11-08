import { MEDIA_TYPES, NO_TIME_LIMIT } from "@razzia/common/constants"
import { visualsConfigValidator } from "@razzia/common/validators/visuals"
import { z } from "zod"

export const QUIZZ_LIMITS = {
  SUBJECT: 200,
  QUESTION: 500,
  ANSWER: 200,
  URL: 2048,
  QUESTIONS: 200,
  MAX_TIME: 600,
} as const

const text = (max: number, emptyKey: string) =>
  z.string().trim().min(1, emptyKey).max(max, "errors:quizz.textTooLong")

export const questionMediaValidator = z.object({
  type: z
    .enum([MEDIA_TYPES.IMAGE, MEDIA_TYPES.VIDEO, MEDIA_TYPES.AUDIO])
    .optional(),
  url: z
    .url({
      protocol: /^https?$/,
      error: "errors:quizz.invalidMediaUrl",
    })
    .max(QUIZZ_LIMITS.URL, "errors:quizz.invalidMediaUrl"),
})

const questionValidator = z
  .object({
    question: text(QUIZZ_LIMITS.QUESTION, "errors:quizz.questionEmpty"),
    media: questionMediaValidator.optional(),
    answers: z
      .array(text(QUIZZ_LIMITS.ANSWER, "errors:quizz.answerEmpty"))
      .min(2, "errors:quizz.tooFewAnswers")
      .max(4, "errors:quizz.tooManyAnswers"),
    solutions: z
      .union([z.number().int().min(0), z.array(z.number().int().min(0)).min(1)])
      .transform((v) => (Array.isArray(v) ? v : [v])),
    cooldown: z.number().int().min(3).max(15),
    time: z
      .number()
      .int()
      .refine(
        (v) => v === NO_TIME_LIMIT || (v >= 1 && v <= QUIZZ_LIMITS.MAX_TIME),
        "errors:quizz.invalidTime",
      ),
  })
  .superRefine((q, ctx) => {
    const valid =
      q.solutions.every((s) => s < q.answers.length) &&
      new Set(q.solutions).size === q.solutions.length

    if (!valid) {
      ctx.addIssue({
        code: "custom",
        path: ["solutions"],
        message: "errors:quizz.invalidSolution",
      })
    }
  })

export const quizzValidator = z.object({
  subject: text(QUIZZ_LIMITS.SUBJECT, "errors:quizz.subjectEmpty"),
  visuals: visualsConfigValidator.optional(),
  questions: z
    .array(questionValidator)
    .min(1, "errors:quizz.noQuestions")
    .max(QUIZZ_LIMITS.QUESTIONS, "errors:quizz.tooManyQuestions"),
})

export type QuizzValidated = z.infer<typeof quizzValidator>
