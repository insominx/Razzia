import { describe, expect, it } from "vitest"

describe("i18n document language", () => {
  it("keeps <html lang> in step with the chosen language", async () => {
    const { default: i18n } = await import("@razzia/web/i18n")

    await i18n.changeLanguage("ja")

    expect(document.documentElement.lang).toBe("ja")

    await i18n.changeLanguage("de")

    expect(document.documentElement.lang).toBe("de")
  })
})
