import type { TFunction } from "i18next"

const PODIUM_RANKS = new Set([1, 2, 3])

/**
 * Localized "Nth place". Ranks 1–3 keep their hand-written strings; every
 * other rank goes through `game:rank.other` as an ordinal plural, so English
 * can split it into `_ordinal_one/two/few/other` ("21st", "22nd", "23rd",
 * "24th"). Locales whose wording does not change with the number only ship
 * the unsuffixed key, which i18next falls back to.
 */
export const formatRank = (t: TFunction, rank: number): string =>
  PODIUM_RANKS.has(rank)
    ? t(`game:rank.${rank}`)
    : t("game:rank.other", { rank, count: rank, ordinal: true })
