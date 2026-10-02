import type { UpgradeRejection } from "../http/loginHandler.js";

/**
 * Minimal WebSocket connection logger for production observability. Emits one
 * structured stdout line per lifecycle event so `fly logs -a rtc-clone-server`
 * (or any log drain) shows live connection activity — accepts, disconnects, and
 * rejected upgrades — without pulling in a logging framework.
 *
 * It never logs tokens or credentials: a rejected upgrade is logged by its
 * {@link UpgradeRejection} reason only. `out`/`now` are injected so the format
 * is unit-testable and the clock is deterministic in tests.
 */
export interface ConnectionLog {
  recordConnect(): void;
  recordDisconnect(): void;
  recordRejectedUpgrade(reason: UpgradeRejection): void;
  /** A protocol-level error on an accepted socket (oversized frame, bad
   * UTF-8, reserved bits). `ws` emits `error` for these and Node would throw
   * with no listener — so the listener exists, and logs the `code` only. */
  recordSocketError(code: string): void;
}

export function createConnectionLog(
  out: (line: string) => void = console.log,
  now: () => number = () => {
    return Date.now();
  },
): ConnectionLog {
  let active = 0;
  let total = 0;

  function stamp(): string {
    return new Date(now()).toISOString();
  }

  return {
    recordConnect(): void {
      active += 1;
      total += 1;
      out(`[ws] ${stamp()} connect       active=${active} total=${total}`);
    },
    recordDisconnect(): void {
      // Guard against a stray close after active hits zero — never go negative.
      active = Math.max(0, active - 1);
      out(`[ws] ${stamp()} disconnect    active=${active} total=${total}`);
    },
    recordRejectedUpgrade(reason: UpgradeRejection): void {
      out(`[ws] ${stamp()} upgrade-reject reason=${reason} active=${active}`);
    },
    recordSocketError(code: string): void {
      out(`[ws] ${stamp()} socket-error   code=${code} active=${active}`);
    },
  };
}
