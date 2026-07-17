import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SessionStore, StoredSession } from "@rtc/client-core";
import type { SessionUser } from "@rtc/domain";

export const SESSION_STORAGE_KEY = "rtc-session";

interface ParsedStoredSession {
  readonly token: unknown;
  readonly user: unknown;
  readonly username: unknown;
  readonly exp: unknown;
}

function isSessionUser(value: unknown): value is SessionUser {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const user = value as Record<string, unknown>;
  return (
    typeof user.name === "string" &&
    typeof user.initials === "string" &&
    typeof user.role === "string" &&
    typeof user.id === "string" &&
    typeof user.email === "string" &&
    typeof user.desk === "string" &&
    typeof user.clearance === "string"
  );
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const parsed = value as ParsedStoredSession;
  return (
    typeof parsed.token === "string" &&
    typeof parsed.username === "string" &&
    typeof parsed.exp === "number" &&
    isSessionUser(parsed.user)
  );
}

function parseSession(raw: string | null): StoredSession | null {
  if (raw === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * AsyncStorage-backed SessionStore for the RN client. `SessionStore` is
 * synchronous but AsyncStorage is async, so — mirroring
 * `AsyncStoragePreferencesAdapter` — an in-memory mirror serves the synchronous
 * port while writes go through to AsyncStorage fire-and-forget. `hydrate()`
 * reads the store once and returns a seeded instance; the RN composition gates
 * `AppRoot`'s mount on it (`_layout.tsx`) so `AuthPresenter.resume()` reads a
 * live mirror rather than an empty store and can resume a persisted session.
 * Tolerant of corrupt/missing storage (returns null). Mirrors the web
 * `LocalStorageSessionStore`'s key name and validation guards so the two stay
 * behaviourally interchangeable. Never logs the session contents
 * (token/credentials).
 */
export class AsyncStorageSessionStore implements SessionStore {
  private session: StoredSession | null;

  private constructor(initial: StoredSession | null) {
    this.session = initial;
  }

  static async hydrate(): Promise<AsyncStorageSessionStore> {
    try {
      const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
      return new AsyncStorageSessionStore(parseSession(raw));
    } catch {
      return new AsyncStorageSessionStore(null);
    }
  }

  read(): StoredSession | null {
    return this.session;
  }

  write(session: StoredSession): void {
    this.session = session;
    void AsyncStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(session),
    ).catch(() => {});
  }

  clear(): void {
    this.session = null;
    void AsyncStorage.removeItem(SESSION_STORAGE_KEY).catch(() => {});
  }
}
