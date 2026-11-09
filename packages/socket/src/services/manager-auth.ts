import { createHash, timingSafeEqual } from "node:crypto"

export type ManagerAuthResult = { ok: true } | { ok: false; error: string }

const digest = (value: string) => createHash("sha256").update(value).digest()

export const verifyManagerAuth = (
  password: string | undefined,
  config: { managerPassword?: string },
): ManagerAuthResult => {
  if (typeof config.managerPassword !== "string" || !config.managerPassword) {
    return { ok: false, error: "errors:manager.failedToReadConfig" }
  }

  if (config.managerPassword === "PASSWORD") {
    return { ok: false, error: "errors:manager.passwordNotConfigured" }
  }

  // Hashed first so the compare takes the same time for any length.
  if (
    typeof password !== "string" ||
    !timingSafeEqual(digest(password), digest(config.managerPassword))
  ) {
    return { ok: false, error: "errors:manager.invalidPassword" }
  }

  return { ok: true }
}
