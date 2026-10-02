type AcceptVerdict = "ok" | "too-many-connections" | "too-many-from-ip";

export interface ConnectionLimits {
  readonly maxTotal: number;
  readonly maxPerIp: number;
}

export interface ConnectionGuard {
  canAccept(ip: string): AcceptVerdict;
  acquire(ip: string): void;
  release(ip: string): void;
  total(): number;
}

/** S8 — live-socket caps. `canAccept` is a CHECK (used in `verifyClient`,
 * before the handshake); `acquire`/`release` bracket the socket's real
 * lifetime (`connection` → `close`), so an upgrade that passes the check
 * but never completes its handshake holds no slot. Two concurrent upgrades
 * can both pass the check — one extra socket, not a leak. */
export function createConnectionGuard(
  limits: ConnectionLimits,
): ConnectionGuard {
  const perIp = new Map<string, number>();
  let live = 0;

  return {
    canAccept(ip: string): AcceptVerdict {
      if (live >= limits.maxTotal) {
        return "too-many-connections";
      }

      if ((perIp.get(ip) ?? 0) >= limits.maxPerIp) {
        return "too-many-from-ip";
      }

      return "ok";
    },
    acquire(ip: string): void {
      live += 1;
      perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    },
    release(ip: string): void {
      const count = perIp.get(ip);

      if (count === undefined) {
        return;
      }

      live = Math.max(0, live - 1);

      if (count <= 1) {
        perIp.delete(ip);
      } else {
        perIp.set(ip, count - 1);
      }
    },
    total(): number {
      return live;
    },
  };
}
