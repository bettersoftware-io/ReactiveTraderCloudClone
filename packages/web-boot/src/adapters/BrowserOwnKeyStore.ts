import type { OwnKeyStore, StoredOwnKey } from "@rtc/core-api";

export const OWN_KEY_STORAGE_KEY = "rt-jarvis-own-key";

const PROVIDERS: readonly unknown[] = ["anthropic", "openrouter", "openai"];

function isStoredOwnKey(value: unknown): value is StoredOwnKey {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const parsed = value as Record<string, unknown>;
  return (
    typeof parsed.owner === "string" &&
    PROVIDERS.includes(parsed.provider) &&
    typeof parsed.key === "string" &&
    (parsed.capUsd === null || typeof parsed.capUsd === "number") &&
    typeof parsed.remember === "boolean"
  );
}

/** Removes the stored value from `storage`; a storage that throws is ignored. */
function removeFrom(storage: () => Storage): void {
  try {
    storage().removeItem(OWN_KEY_STORAGE_KEY);
  } catch {
    // best-effort: storage can be disabled or full
  }
}

/** Reads one JSON value from `storage`: `undefined` when the entry is absent
 * or storage throws, `null` when it was present but malformed (and removed). */
function readFrom(storage: () => Storage): StoredOwnKey | null | undefined {
  try {
    const raw = storage().getItem(OWN_KEY_STORAGE_KEY);

    if (raw === null) {
      return undefined;
    }

    const parsed: unknown = JSON.parse(raw);

    if (isStoredOwnKey(parsed)) {
      return parsed;
    }
  } catch {
    // unreadable storage, or JSON.parse threw: treated as malformed below
  }

  removeFrom(storage);
  return null;
}

function sessionArea(): Storage {
  return sessionStorage;
}

function localArea(): Storage {
  return localStorage;
}

/**
 * The person's own model key in the browser. One JSON value under
 * `rt-jarvis-own-key`: in sessionStorage (gone with the tab) or, when the
 * person chose `remember`, in localStorage; never in both. Best-effort and
 * tolerant like `LocalStorageSessionStore`: storage that throws or holds
 * malformed data reads as `null` (malformed data is also removed). Never
 * logs the value.
 */
export class BrowserOwnKeyStore implements OwnKeyStore {
  read(): StoredOwnKey | null {
    return readFrom(sessionArea) ?? readFrom(localArea) ?? null;
  }

  write(stored: StoredOwnKey): void {
    const [target, other] = stored.remember
      ? [localArea, sessionArea]
      : [sessionArea, localArea];

    try {
      target().setItem(OWN_KEY_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // best-effort persistence
    }

    removeFrom(other);
  }

  clear(): void {
    removeFrom(sessionArea);
    removeFrom(localArea);
  }
}
