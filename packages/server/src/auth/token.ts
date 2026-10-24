import { createHmac, timingSafeEqual } from "node:crypto";

import type { AccessLevel } from "@rtc/domain";

/** The registered account a token was issued for. Roster logins carry none. */
export interface TokenAccount {
  readonly accountId: string;
  readonly access: AccessLevel;
}

interface Payload {
  readonly u: string;
  readonly exp: number;
  readonly id?: string;
  readonly a?: AccessLevel;
  /** Issued-at, epoch ms. Account tokens only. */
  readonly iat?: number;
}

export interface VerifiedToken {
  readonly username: string;
  /** Null for a roster login, which has no directory entry. */
  readonly accountId: string | null;
  readonly access: AccessLevel;
  /** When an account token was issued (epoch ms). Null for a roster token
   * AND for an account token minted before B2c: verification does not refuse
   * the latter, so the upgrade can end it visibly. */
  readonly issuedAt: number | null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signToken(
  username: string,
  secret: string,
  ttlMs: number,
  now: number,
  account: TokenAccount | null = null,
): string {
  const payload: Payload =
    account === null
      ? { u: username, exp: now + ttlMs }
      : {
          u: username,
          exp: now + ttlMs,
          id: account.accountId,
          a: account.access,
          iat: now,
        };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyToken(
  token: string,
  secret: string,
  now: number,
): VerifiedToken | null {
  const dot = token.indexOf(".");

  if (dot < 0) {
    return null;
  }

  const encoded = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = sign(encoded, secret);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Payload;
    const claims = readClaims(payload);

    return claims !== null && payload.exp > now ? claims : null;
  } catch {
    return null;
  }
}

/** A token carries BOTH account claims or NEITHER. A half-claim is a
 * malformed token, never a quiet downgrade to `user`. */
function readClaims(payload: Payload): VerifiedToken | null {
  if (typeof payload.u !== "string" || typeof payload.exp !== "number") {
    return null;
  }

  if (payload.id === undefined && payload.a === undefined) {
    return {
      username: payload.u,
      accountId: null,
      access: "user",
      issuedAt: null,
    };
  }

  if (
    typeof payload.id !== "string" ||
    payload.id === "" ||
    (payload.a !== "user" && payload.a !== "admin")
  ) {
    return null;
  }

  if (payload.iat !== undefined && typeof payload.iat !== "number") {
    return null;
  }

  return {
    username: payload.u,
    accountId: payload.id,
    access: payload.a,
    issuedAt: payload.iat ?? null,
  };
}
