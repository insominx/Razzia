/**
 * A `Storage` that lives in memory. The test environment's own `localStorage`
 * is not always a working one, and a test should say which storage it means.
 */
export const memoryStorage = (): Storage => {
  const items = new Map<string, string>()

  return {
    get length() {
      return items.size
    },
    clear: () => {
      items.clear()
    },
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key)
    },
    setItem: (key, value) => {
      items.set(key, value)
    },
  }
}

/** A storage that takes nothing, as a browser with site data blocked behaves. */
export const refusingStorage = (): Storage => {
  const storage = memoryStorage()

  storage.setItem = () => {
    throw new Error("The browser would not keep it.")
  }

  return storage
}
