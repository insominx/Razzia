import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import { describe, expect, it } from "vitest"

// A circular import is harmless until the order modules load in changes: then a
// module reads another's export before it exists. It already broke the app once
// (the score built its runtime at import, in a cycle through the screens) and it
// breaks hot reload of any screen that sits in one. This reads the source, so it
// needs no build, and fails with the cycle spelled out.

// The test environment's `URL` is the browser's, which will not give a file path.
const SRC = `${resolve(import.meta.dirname, "..")}${sep}`

const ALIAS = "@razzia/web/"

const IMPORT =
  /^\s*(?:import|export)\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/gmu

const isSource = (name: string) =>
  /\.tsx?$/u.test(name) && !/\.(?:test|d)\.tsx?$/u.test(name)

const listSources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)

    if (statSync(path).isDirectory()) {
      return listSources(path)
    }

    return isSource(name) ? [path] : []
  })

const baseOf = (specifier: string, importer: string): string | null => {
  if (specifier.startsWith(ALIAS)) {
    return join(SRC, specifier.slice(ALIAS.length))
  }

  return specifier.startsWith(".")
    ? resolve(dirname(importer), specifier)
    : null
}

const resolveSpecifier = (
  specifier: string,
  importer: string,
  files: ReadonlySet<string>,
): string | null => {
  const base = baseOf(specifier, importer)

  if (base === null) {
    return null
  }

  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]

  return candidates.find((candidate) => files.has(candidate)) ?? null
}

/** `import { type A, type B } from` is erased too, when every member is a type. */
const onlyTypes = (statement: string): boolean => {
  const braces = /\{([^}]*)\}/u.exec(statement)

  if (!braces) {
    return false
  }

  const members = braces[1].split(",").filter((member) => member.trim() !== "")

  return (
    members.length > 0 &&
    members.every((member) => member.trim().startsWith("type "))
  )
}

const runtimeImports = (text: string): string[] =>
  [...text.matchAll(IMPORT)]
    .filter(([statement, typeOnly]) => !typeOnly && !onlyTypes(statement))
    .map(([, , specifier]) => specifier)

type Graph = ReadonlyMap<string, readonly string[]>

/** The first cycle found, as the modules around it, or `[]` for none. */
export const findCycle = (graph: Graph): string[] => {
  const done = new Set<string>()
  const path: string[] = []

  const visit = (node: string): string[] => {
    const at = path.indexOf(node)

    if (at !== -1) {
      return [...path.slice(at), node]
    }

    if (done.has(node)) {
      return []
    }

    path.push(node)

    for (const next of graph.get(node) ?? []) {
      const cycle = visit(next)

      if (cycle.length > 0) {
        return cycle
      }
    }

    path.pop()
    done.add(node)

    return []
  }

  for (const node of graph.keys()) {
    const cycle = visit(node)

    if (cycle.length > 0) {
      return cycle
    }
  }

  return []
}

describe("findCycle", () => {
  it("finds a cycle and names its modules", () => {
    const graph = new Map([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", ["a"]],
    ])

    expect(findCycle(graph)).toEqual(["a", "b", "c", "a"])
  })

  it("passes modules that share a dependency without looping", () => {
    const graph = new Map([
      ["a", ["b", "c"]],
      ["b", ["d"]],
      ["c", ["d"]],
      ["d", []],
    ])

    expect(findCycle(graph)).toEqual([])
  })
})

const dependenciesOf = (file: string, files: ReadonlySet<string>) =>
  runtimeImports(readFileSync(file, "utf8")).flatMap((specifier) => {
    const target = resolveSpecifier(specifier, file, files)

    return target && target !== file ? [target] : []
  })

describe("the web package's imports", () => {
  it("have no circular runtime import", () => {
    const sources = listSources(SRC)
    const files = new Set(sources)
    const graph = new Map(
      sources.map((file) => [file, dependenciesOf(file, files)]),
    )
    const cycle = findCycle(graph).map((file) => file.slice(SRC.length))

    expect(cycle, `circular import: ${cycle.join(" -> ")}`).toEqual([])
  })
})
