import { createHmac, timingSafeEqual } from "node:crypto";

interface Payload {
  readonly u: string;
  readonly exp: number;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signToken(
  username: string,
  secret: string,
  ttlMs: number,
  now: number,
): string {
  const payload: Payload = { u: username, exp: now + ttlMs };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyToken(
  token: string,
  secret: string,
  now: number,
): { username: string } | null {
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

    if (typeof payload.u !== "string" || typeof payload.exp !== "number") {
      return null;
    }

    return payload.exp > now ? { username: payload.u } : null;
  } catch {
    return null;
  }
}
