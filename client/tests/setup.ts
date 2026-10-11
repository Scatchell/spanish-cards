import '@testing-library/jest-dom/vitest';

// Node 25 ships its own `localStorage` global that is unusable without
// --localstorage-file and shadows jsdom's, so give jsdom tests a plain
// in-memory Storage.
if (typeof window !== 'undefined' && typeof globalThis.localStorage?.clear !== 'function') {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, 'localStorage', { value: storage, configurable: true });
  }
}
