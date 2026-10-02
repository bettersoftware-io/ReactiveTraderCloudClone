export type StrikeReason =
  | "login-failed"
  | "login-rate-limited"
  | "frame-too-large"
  | "message-flood";

/** How much each kind of misbehaviour counts. A wrong password is cheap
 * and human; an oversized frame or a flood is scripted. */
export const STRIKE_WEIGHT: Readonly<Record<StrikeReason, number>> = {
  "login-failed": 1,
  "login-rate-limited": 2,
  "frame-too-large": 3,
  "message-flood": 3,
};

export interface BanListOptions {
  readonly strikesToBan: number;
  readonly strikeWindowMs: number;
  readonly banMs: number;
  readonly maxEntries: number;
  /** Logging slot — called once per ban, never for a strike on an already-banned IP. */
  readonly onBan?: (ip: string, untilMs: number, reason: StrikeReason) => void;
}

export interface BanList {
  /** Records one strike; returns true when THIS strike crossed the threshold. */
  strike(ip: string, reason: StrikeReason, now: number): boolean;
  isBanned(ip: string, now: number): boolean;
  bannedUntil(ip: string, now: number): number | null;
  size(): number;
}

interface Entry {
  strikes: number;
  windowStart: number;
  bannedUntil: number;
}

/**
 * §9.2 — the in-app expiring ban table, checked FIRST at both edges (before
 * the scrypt hash on `/login`, before token verification on the upgrade) so
 * a banned caller costs a Map lookup. In-memory by design: a restart clears
 * it, which is fine for temporary bans. Time is always the caller's `now`.
 */
export function createBanList(options: BanListOptions): BanList {
  const entries = new Map<string, Entry>();

  function bannedUntil(ip: string, now: number): number | null {
    const entry = entries.get(ip);

    return entry !== undefined && entry.bannedUntil > now
      ? entry.bannedUntil
      : null;
  }

  function isLive(entry: Entry, now: number): boolean {
    return (
      entry.bannedUntil > now ||
      now < entry.windowStart + options.strikeWindowMs
    );
  }

  function sweepExpired(now: number): void {
    for (const [ip, entry] of entries) {
      if (!isLive(entry, now)) {
        entries.delete(ip);
      }
    }
  }

  function evictOldest(): void {
    let oldest: string | undefined;
    let oldestAt = Number.POSITIVE_INFINITY;

    for (const [ip, entry] of entries) {
      const at = Math.max(entry.bannedUntil, entry.windowStart);

      if (at < oldestAt) {
        oldestAt = at;
        oldest = ip;
      }
    }

    if (oldest !== undefined) {
      entries.delete(oldest);
    }
  }

  function makeRoom(now: number): void {
    if (entries.size >= options.maxEntries) {
      sweepExpired(now);
    }

    if (entries.size >= options.maxEntries) {
      evictOldest();
    }
  }

  return {
    strike(ip: string, reason: StrikeReason, now: number): boolean {
      if (bannedUntil(ip, now) !== null) {
        return false;
      }

      let entry = entries.get(ip);

      if (entry === undefined) {
        makeRoom(now);
        entry = { strikes: 0, windowStart: now, bannedUntil: 0 };
        entries.set(ip, entry);
      } else if (now >= entry.windowStart + options.strikeWindowMs) {
        entry.strikes = 0;
        entry.windowStart = now;
      }

      entry.strikes += STRIKE_WEIGHT[reason];

      if (entry.strikes < options.strikesToBan) {
        return false;
      }

      entry.strikes = 0;
      entry.bannedUntil = now + options.banMs;
      options.onBan?.(ip, entry.bannedUntil, reason);

      return true;
    },
    isBanned(ip: string, now: number): boolean {
      return bannedUntil(ip, now) !== null;
    },
    bannedUntil,
    size(): number {
      return entries.size;
    },
  };
}
