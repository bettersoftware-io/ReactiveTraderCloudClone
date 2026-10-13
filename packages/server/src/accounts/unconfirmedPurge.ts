import type { AccountDirectory } from "./AccountDirectory.js";

export interface PurgeScheduleOptions {
  readonly directory: Pick<AccountDirectory, "purgeUnconfirmedBefore">;
  readonly now: () => number;
  readonly retentionMs: number;
  readonly intervalMs: number;
  readonly firstRunDelayMs: number;
  readonly batch: number;
  readonly log: (line: string) => void;
}

export interface PurgeSchedule {
  stop(): void;
}

/**
 * Deletes accounts never confirmed within the retention (spec §3.3): a first
 * run shortly after start, then one every interval, each bounded to one
 * batch. Both timers are unref'd, so the schedule never holds the process
 * open. It logs a count when it purged something and one line when the
 * store did not answer — never an id or an address.
 */
export function startUnconfirmedPurge(
  options: PurgeScheduleOptions,
): PurgeSchedule {
  let repeating: ReturnType<typeof setInterval> | undefined;

  async function runOnce(): Promise<void> {
    const result = await options.directory.purgeUnconfirmedBefore(
      options.now() - options.retentionMs,
      options.batch,
    );

    if (result.outcome === "unavailable") {
      options.log("[accounts] purge unavailable");
    } else if (result.count > 0) {
      options.log(`[accounts] purged ${result.count} unconfirmed accounts`);
    }
  }

  /** Runs one purge; a rejected run is the same line as an unanswered store,
   * never an unhandled rejection that would terminate the process. */
  function purgeOnce(): void {
    runOnce().catch(() => {
      options.log("[accounts] purge unavailable");
    });
  }

  const first = setTimeout(() => {
    purgeOnce();
    repeating = setInterval(purgeOnce, options.intervalMs);
    repeating.unref();
  }, options.firstRunDelayMs);
  first.unref();

  return {
    stop(): void {
      clearTimeout(first);

      if (repeating !== undefined) {
        clearInterval(repeating);
      }
    },
  };
}
