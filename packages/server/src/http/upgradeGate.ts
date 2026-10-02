import type { AuthService } from "../auth/AuthService.js";
import type { BanList } from "../auth/banList.js";
import type { ConnectionGuard } from "../socket/connectionGuard.js";
import { describeUpgrade, type UpgradeRejection } from "./loginHandler.js";

export interface UpgradeGateDeps {
  readonly auth: AuthService;
  readonly banList: BanList;
  readonly connections: ConnectionGuard;
  readonly now: () => number;
}

export interface UpgradeVerdict {
  readonly ok: boolean;
  readonly status: 200 | 401 | 429 | 503;
  readonly reason?: UpgradeRejection;
}

/** The whole upgrade decision, cheapest check first: a banned IP costs a Map
 * lookup (429), a capped IP or a full server costs two (503), and only then
 * is the token verified (401 on any of `describeUpgrade`'s reasons). The
 * caps are a CHECK here — `index.ts` acquires the slot on `connection` and
 * releases it on `close`, so a handshake that never completes holds none. */
export function decideUpgrade(
  url: string | undefined,
  ip: string,
  deps: UpgradeGateDeps,
): UpgradeVerdict {
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

  return { ok: true, status: 200 };
}
