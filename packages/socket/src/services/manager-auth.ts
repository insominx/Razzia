export type ManagerAuthResult = { ok: true } | { ok: false; error: string }

export const verifyManagerAuth = (
  password: string | undefined,
  config: { managerPassword?: string },
): ManagerAuthResult => {
  if (typeof config.managerPassword !== "string" || !config.managerPassword) {
    return { ok: false, error: "errors:failedToReadConfig" }
  }

  if (config.managerPassword === "PASSWORD") {
    return { ok: false, error: "errors:manager.passwordNotConfigured" }
  }

  if (typeof password !== "string" || password !== config.managerPassword) {
    return { ok: false, error: "errors:manager.invalidPassword" }
  }

  return { ok: true }
}
