import { formatRank } from "@razzia/web/features/game/utils/rank"
import de from "@razzia/web/locales/de/game.json"
import en from "@razzia/web/locales/en/game.json"
import i18next from "i18next"
import { beforeAll, describe, expect, it } from "vitest"

const i18n = i18next.createInstance()

beforeAll(async () => {
  await i18n.init({
    lng: "en",
    fallbackLng: "en",
    defaultNS: "common",
    resources: { en: { game: en }, de: { game: de } },
  })
})

describe("formatRank", () => {
  it("keeps the hand-written podium strings", async () => {
    await i18n.changeLanguage("en")

    expect([1, 2, 3].map((rank) => formatRank(i18n.t, rank))).toEqual([
      "1st place",
      "2nd place",
      "3rd place",
    ])
  })

  it("resolves the game namespace instead of leaking the key", async () => {
    await i18n.changeLanguage("en")

    expect(formatRank(i18n.t, 4)).toBe("4th place")
    expect(formatRank(i18n.t, 4)).not.toContain("rank.other")
  })

  it("uses English ordinal suffixes past the podium", async () => {
    await i18n.changeLanguage("en")

    expect(
      [11, 12, 13, 21, 22, 23, 101, 111].map((rank) =>
        formatRank(i18n.t, rank),
      ),
    ).toEqual([
      "11th place",
      "12th place",
      "13th place",
      "21st place",
      "22nd place",
      "23rd place",
      "101st place",
      "111th place",
    ])
  })

  it("falls back to the plain key where a locale has no ordinal forms", async () => {
    await i18n.changeLanguage("de")

    expect(formatRank(i18n.t, 22)).toBe("22. Platz")
  })
})
