import type { SessionUser } from "@rtc/domain";

export interface StoredSession {
  readonly token: string;
  readonly user: SessionUser;
  readonly username: string;
  readonly exp: number;
}

export interface SessionStore {
  read(): StoredSession | null;
  write(session: StoredSession): void;
  clear(): void;
}
