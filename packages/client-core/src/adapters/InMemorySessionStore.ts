import type { SessionStore, StoredSession } from "./sessionStore.js";

export class InMemorySessionStore implements SessionStore {
  private session: StoredSession | null = null;

  public read(): StoredSession | null {
    return this.session;
  }

  public write(session: StoredSession): void {
    this.session = session;
  }

  public clear(): void {
    this.session = null;
  }
}
