// jsdom on Node 26 does not expose localStorage, and never implements canvas
// 2D — shim both so smoke tests can mount the app (boot canvas + theme
// persistence) without touching real browser APIs.
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

function installStorage(): void {
  if (typeof globalThis.localStorage !== "undefined") {
    return;
  }

  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string): string | null => {
      return store.has(k) ? (store.get(k) as string) : null;
    },
    setItem: (k: string, v: string): void => {
      store.set(k, String(v));
    },
    removeItem: (k: string): void => {
      store.delete(k);
    },
    clear: (): void => {
      store.clear();
    },
    key: (i: number): string | null => {
      return Array.from(store.keys())[i] ?? null;
    },
    get length(): number {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  installStorage();
  globalThis.localStorage.clear();

  HTMLCanvasElement.prototype.getContext = (() => {
    return null;
  }) as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  cleanup();
  globalThis.localStorage.clear();
});
