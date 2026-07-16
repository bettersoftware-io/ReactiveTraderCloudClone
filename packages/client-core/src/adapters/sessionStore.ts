import type { SessionUser } from "@rtc/domain";

export interface StoredSession {
  readonly token: string;
  readonly user: SessionUser;
  readonly exp: number;
}

export interface SessionStore {
  read(): StoredSession | null;
  write(session: StoredSession): void;
  clear(): void;
}

// eslint-disable-next-line rtc/class-filename-match -- Simple adapter with both interfaces and small implementation
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
