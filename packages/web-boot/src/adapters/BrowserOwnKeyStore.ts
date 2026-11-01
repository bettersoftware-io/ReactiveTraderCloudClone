import type { OwnKeyStore, StoredOwnKey } from "@rtc/core-api";
import { isJarvisProvider } from "@rtc/domain";

export const OWN_KEY_STORAGE_KEY = "rt-jarvis-own-key";

function isStoredOwnKey(value: unknown): value is StoredOwnKey {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const parsed = value as Record<string, unknown>;
  return (
    typeof parsed.owner === "string" &&
    isJarvisProvider(parsed.provider) &&
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

/** Reads one JSON value from `storage`. Storage that throws, or holds
 * nothing, reads as `null` and removes nothing (a transient failure must not
 * delete a valid key); only data that WAS read and is malformed is removed. */
function readFrom(storage: () => Storage): StoredOwnKey | null {
  let raw: string | null;

  try {
    raw = storage().getItem(OWN_KEY_STORAGE_KEY);
  } catch {
    return null;
  }

  if (raw === null) {
    return null;
  }

  const parsed = parseStored(raw);

  if (parsed === null) {
    removeFrom(storage);
  }

  return parsed;
}

function parseStored(raw: string): StoredOwnKey | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredOwnKey(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
