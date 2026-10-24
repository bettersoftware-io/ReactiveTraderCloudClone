import type { AccountStatusCache } from "../accounts/accountStatusCache.js";
import type { RevocationLedger } from "../accounts/revocationLedger.js";
import { hasSessionEnded } from "../accounts/sessionEnd.js";
import type { SessionRegistry } from "../accounts/sessionRegistry.js";
import type { AuthService } from "../auth/AuthService.js";
import type { BanList } from "../auth/banList.js";
import type { Caller } from "../services/serviceContainer.js";
import type { ConnectionGuard } from "../socket/connectionGuard.js";
import { describeUpgrade, type UpgradeRejection } from "./loginHandler.js";

export interface UpgradeGateDeps {
  readonly auth: AuthService;
  readonly banList: BanList;
  readonly connections: ConnectionGuard;
  readonly accountStatus: AccountStatusCache;
  readonly revocations: RevocationLedger;
  /** Read for the account's revocation epoch before the status lookup. */
  readonly sessions: Pick<SessionRegistry, "epochOf">;
  readonly now: () => number;
}

export interface UpgradeVerdict {
  readonly ok: boolean;
  readonly status: 200 | 401 | 429 | 503;
  readonly reason?: UpgradeRejection;
  /** Set when `ok`: who is on the other end. */
  readonly caller?: Caller;
  /** `ok` and true: accept the handshake, then close at once with the
   * session-ended code, so the browser can tell "signed out" from "down". */
  readonly sessionEnded?: boolean;
  /** The account's revocation epoch as read BEFORE its status was looked up.
   * `connection` compares it with the registry's current one: a larger value
   * means the sessions were ended while the lookup was in flight. */
  readonly revocationEpoch?: number;
}

/** The whole upgrade decision, cheapest check first: a banned IP costs a Map
 * lookup (429), a capped IP or a full server costs two (503), then the token
 * is verified (401 on any of `describeUpgrade`'s reasons). A registered
 * account's token is then re-checked against the account's CURRENT record
 * (spec §5.6): a token lives eight hours, a block must not wait for it. A
 * session that has ended (blocked, unapproved, deleted, issued before a
 * stamp, or carrying no `iat`) is ACCEPTED with `sessionEnded`, not refused:
 * a refusal reads as an outage on the client; the close code says "signed
 * out". Only an unreadable directory refuses (503). The
 * caps are a CHECK here — `index.ts` acquires the slot on `connection` and
 * releases it on `close`, so a handshake that never completes holds none. The
 * re-check after the awaited status narrows the window between check and
 * reservation to microtasks; it does not close it — the overshoot is bounded
 * and accepted (see `connectionGuard`). */
export async function decideUpgrade(
  url: string | undefined,
  ip: string,
  deps: UpgradeGateDeps,
): Promise<UpgradeVerdict> {
  if (deps.banList.isBanned(ip, deps.now())) {
    return { ok: false, status: 429, reason: "banned" };
  }

  const capacity = deps.connections.canAccept(ip);

  if (capacity !== "ok") {
    return { ok: false, status: 503, reason: capacity };
  }

  const decision = describeUpgrade(url, deps.auth);

  if (!decision.ok) {
    return { ok: false, status: 401, reason: decision.reason };
  }

  const { token } = decision;
  const caller: Caller = {
    username: token.username,
    accountId: token.accountId,
    issuedAt: token.issuedAt,
  };

  // A roster login has no directory entry to re-check.
  if (token.accountId === null) {
    return { ok: true, status: 200, caller };
  }

  // Before the await: a revocation that lands during the lookup must be seen.
  const revocationEpoch = deps.sessions.epochOf(token.accountId);
  const account = await deps.accountStatus.read(token.accountId);
  const verdict = hasSessionEnded(
    token.issuedAt,
    account,
    deps.revocations.notBefore(token.accountId),
  );

  if (verdict === "unavailable") {
    return { ok: false, status: 503, reason: "accounts-unavailable" };
  }

  // The await let other upgrades through: check the caps again.
  const recheck = deps.connections.canAccept(ip);

  if (recheck !== "ok") {
    return { ok: false, status: 503, reason: recheck };
  }

  if (verdict === "ended") {
    return {
      ok: true,
      status: 200,
      caller,
      sessionEnded: true,
      revocationEpoch,
    };
  }

  return { ok: true, status: 200, caller, revocationEpoch };
}
