import z from "zod"

// Control, format (zero-width, bidi overrides) and line/paragraph separators.
const HIDDEN_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u

// A joiner between two visible characters is part of an emoji sequence
// (a family, a woman technologist) or of a script (Persian); a lone or doubled
// one is still hidden.
const JOINERS =
  /([^\p{Cc}\p{Cf}\p{Zl}\p{Zp}\s])[‌‍](?=[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}\s])/gu

export const normalizeUsername = (username: string): string =>
  username.trim().replace(/\s+/g, " ")

export const usernameValidator = z
  .string()
  .refine(
    (v) => !HIDDEN_CHARS.test(v.replace(JOINERS, "$1")),
    "errors:auth.usernameInvalid",
  )
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .min(1, "errors:auth.usernameTooShort")
      .max(20, "errors:auth.usernameTooLong"),
  )

export const inviteCodeValidator = z
  .string()
  .length(6, "errors:auth.invalidInviteCode")
