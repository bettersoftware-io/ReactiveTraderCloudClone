import type { AccountStatusCache } from "../accounts/accountStatusCache.js";
import type { AuthService } from "../auth/AuthService.js";
import type { BanList } from "../auth/banList.js";
import type { ConnectionGuard } from "../socket/connectionGuard.js";
import { describeUpgrade, type UpgradeRejection } from "./loginHandler.js";

export interface UpgradeGateDeps {
  readonly auth: AuthService;
  readonly banList: BanList;
  readonly connections: ConnectionGuard;
  readonly accountStatus: AccountStatusCache;
  readonly now: () => number;
}

export interface UpgradeVerdict {
  readonly ok: boolean;
  readonly status: 200 | 401 | 403 | 429 | 503;
  readonly reason?: UpgradeRejection;
}

/** The whole upgrade decision, cheapest check first: a banned IP costs a Map
 * lookup (429), a capped IP or a full server costs two (503), then the token
 * is verified (401 on any of `describeUpgrade`'s reasons). A registered
 * account's token is then re-checked against the account's CURRENT status
 * (spec §5.6): a token lives eight hours, a block must not wait for it. The
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

  // A roster login has no directory entry to re-check.
  if (decision.token.accountId === null) {
    return { ok: true, status: 200 };
  }

  const status = await deps.accountStatus.statusOf(decision.token.accountId);

  if (status === "unavailable") {
    return { ok: false, status: 503, reason: "accounts-unavailable" };
  }

  if (status !== "active") {
    return { ok: false, status: 403, reason: "account-not-active" };
  }

  // The await let other upgrades through: check the caps again.
  const recheck = deps.connections.canAccept(ip);

  if (recheck !== "ok") {
    return { ok: false, status: 503, reason: recheck };
  }

  return { ok: true, status: 200 };
}
