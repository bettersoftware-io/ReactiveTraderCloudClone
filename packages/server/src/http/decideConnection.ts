import { SESSION_ENDED_CLOSE_CODE, SESSION_ENDED_REASON } from "@rtc/shared";

import type { SessionRegistry } from "../accounts/sessionRegistry.js";
import type { UpgradeVerdict } from "./upgradeGate.js";

export type ConnectionDecision =
  | { readonly kind: "close"; readonly code: number; readonly reason: string }
  | {
      readonly kind: "serve";
      /** Null for a roster login, which has no sessions to end. */
      readonly accountId: string | null;
    };

/**
 * What to do with a socket the handshake just accepted. The verdict was
 * decided before the socket existed, and `closeAll` only reaches sockets
 * already registered: so a revocation that ran between the gate's status read
 * and now is caught by the epoch (read before the read, compared here) and
 * answered with the same close an already-ended session gets. A missing
 * verdict can only be a bug, and fails closed.
 */
export function decideConnection(
  verdict: UpgradeVerdict | undefined,
  sessions: Pick<SessionRegistry, "epochOf">,
): ConnectionDecision {
  if (verdict?.caller === undefined) {
    return { kind: "close", code: 1011, reason: "internal" };
  }

  const { accountId } = verdict.caller;
  const ended = {
    kind: "close",
    code: SESSION_ENDED_CLOSE_CODE,
    reason: SESSION_ENDED_REASON,
  } as const;

  if (verdict.sessionEnded === true) {
    return ended;
  }

  if (accountId === null) {
    return { kind: "serve", accountId: null };
  }

  // No captured epoch on an account verdict cannot happen; read it as 0 so
  // any revocation at all closes the socket.
  if (sessions.epochOf(accountId) > (verdict.revocationEpoch ?? 0)) {
    return ended;
  }

  return { kind: "serve", accountId };
}
