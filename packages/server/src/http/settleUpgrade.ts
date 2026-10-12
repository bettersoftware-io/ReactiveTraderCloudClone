import type { ConnectionLog } from "../observability/connectionLog.js";
import type { UpgradeVerdict } from "./upgradeGate.js";

interface UpgradeSinks {
  readonly recordRejectedUpgrade: ConnectionLog["recordRejectedUpgrade"];
  readonly log: (line: string) => void;
}

/**
 * Answers a WebSocket handshake from the gate's verdict, exactly once.
 * `done(true)` makes `ws` finish the upgrade and run the `connection`
 * handler synchronously, so a throw from there surfaces here; it must not
 * be mistaken for the gate failing (a second `done(false, 503)` on an
 * upgraded socket). Only a rejection of the verdict itself fails closed with
 * 503. Anything thrown after `done` is logged as one fixed line carrying the
 * error's name only — never its message — and the returned promise never
 * rejects.
 */
export function settleUpgrade(
  verdict: Promise<UpgradeVerdict>,
  done: (ok: boolean, status?: number, message?: string) => void,
  sinks: UpgradeSinks,
): Promise<void> {
  return verdict
    .then(
      (decided: UpgradeVerdict): void => {
        if (!decided.ok && decided.reason) {
          sinks.recordRejectedUpgrade(decided.reason);
        }

        done(
          decided.ok,
          decided.status,
          decided.ok ? undefined : decided.reason,
        );
      },
      (): void => {
        // The gate resolves by design (the status cache reads a failing
        // lookup as `unavailable`); if it ever rejects, fail closed rather
        // than leave the handshake hanging.
        sinks.recordRejectedUpgrade("accounts-unavailable");
        done(false, 503, "accounts-unavailable");
      },
    )
    .catch((err: unknown): void => {
      sinks.log(
        `[ws] upgrade-internal err=${err instanceof Error ? err.name : "unknown"}`,
      );
    });
}
