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

/**
 * localStorage-backed SessionStore. Modelled on LocalStoragePreferencesAdapter:
 * best-effort persistence, tolerant of corrupt/missing/malformed storage (private
 * mode, disabled cookies, hand-edited devtools values) by returning null rather
 * than throwing. Never logs the session contents (token/credentials).
 *
 * Ported verbatim from client-react's adapter of the same name so both web
 * clients persist sessions identically under the shared `rtc-session` key —
 * the key the browser e2e suites seed to boot past the AuthGate (see
 * tests/browser/authSeed.ts). The Solid port originally shipped an in-memory
 * store, which ignored that seed and left every e2e scenario stuck on the
 * LoginScreen.
 */
export class LocalStorageSessionStore implements SessionStore {
  read(): StoredSession | null {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);

      if (raw === null) {
        return null;
      }

      const parsed: unknown = JSON.parse(raw);

      if (!isStoredSession(parsed)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  write(session: StoredSession): void {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // ignore — persistence is best-effort
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore — best-effort
    }
  }
}
