import { describe, expect, it } from "vitest"

const LANGUAGES = ["de", "en", "es", "fr", "it", "ja"] as const

const modules = import.meta.glob<Record<string, unknown>>(
  "./locales/*/*.json",
  { eager: true, import: "default" },
)

// The i18next plural suffixes ("questionCount_one", "other_ordinal_few"). Each
// language has its own set of plural categories, so the forms are compared as
// one key: what must match is that every language can say it.
const PLURAL_SUFFIX = /_(?:ordinal_)?(?:zero|one|two|few|many|other)$/u

// Namespace -> language -> the dotted path of every leaf, e.g. "unsaved.title".
const catalog = new Map<string, Map<string, string[]>>()

const leaves = (value: unknown, prefix = ""): string[] => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [prefix.replace(PLURAL_SUFFIX, "")]
  }

  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, prefix ? `${prefix}.${key}` : key),
  )
}

const isAbsentFrom = (keys: Set<string>) => (key: string) => !keys.has(key)

for (const [path, content] of Object.entries(modules)) {
  const match = /\.\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path)

  if (!match) {
    continue
  }

  const [, language, namespace] = match
  const byLanguage = catalog.get(namespace) ?? new Map<string, string[]>()

  byLanguage.set(language, [...new Set(leaves(content))].sort())
  catalog.set(namespace, byLanguage)
}

describe("locale files", () => {
  it("finds the six languages", () => {
    expect([...LANGUAGES].sort()).toEqual(
      [...new Set([...catalog.values()].flatMap((m) => [...m.keys()]))].sort(),
    )
  })

  it("has at least one namespace", () => {
    expect(catalog.size).toBeGreaterThan(0)
  })

  describe.each([...catalog.entries()])("namespace %s", (_ns, byLanguage) => {
    it("exists in every language", () => {
      expect([...byLanguage.keys()].sort()).toEqual([...LANGUAGES].sort())
    })

    it.each(LANGUAGES)("%s has the same keys as en", (language) => {
      const english = new Set(byLanguage.get("en") ?? [])
      const other = new Set(byLanguage.get(language) ?? [])

      expect({
        missing: [...english].filter(isAbsentFrom(other)),
        extra: [...other].filter(isAbsentFrom(english)),
      }).toEqual({ missing: [], extra: [] })
    })
  })
})
