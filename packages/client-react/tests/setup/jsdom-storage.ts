// jsdom Web Storage shim — keeps the jsdom test environment behaving identically
// across Node versions.
//
// Node 22+ ships a *native* experimental `localStorage`/`sessionStorage` global,
// gated behind the `--localstorage-file` flag. The flag is OFF by default, but
// the accessor pair is still installed on `globalThis`: the getter returns
// `undefined` and the setter silently swallows assignments. Inside vitest's jsdom
// environment that native accessor shadows jsdom's own Storage — vitest populates
// globals via plain assignment, which the native setter discards — so bare
// `localStorage` is `undefined` and DOM-storage tests throw
// "Cannot read properties of undefined (reading 'removeItem')".
//
// Node 24 (current CI / sandbox baseline) has no native Web Storage, so jsdom's
// own implementation wins and the tests pass — which is exactly why this only
// surfaced on a Node 26 host. Rather than pin Node down, install a real in-memory
// Storage whenever no working one is present. We use `Object.defineProperty` with
// a data value (not assignment) precisely so it overrides Node's swallowing
// setter. Real browsers (the visual tier) already have a working `localStorage`
// and are left untouched by the `isWorking` guard.

function isWorking(storage: unknown): storage is Storage {
  try {
    if (!storage) return false;
    const probe = "__rtc_storage_probe__";
    (storage as Storage).setItem(probe, "1");
    (storage as Storage).removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(String(key), String(value));
  }

  [name: string]: unknown;
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  if (!isWorking((globalThis as Record<string, unknown>)[name])) {
    Object.defineProperty(globalThis, name, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
      enumerable: false,
    });
  }
}
