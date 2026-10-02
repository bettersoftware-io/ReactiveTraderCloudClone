/**
 * S2 — thrown by `readBodyWithLimit` (see readBody.ts) the moment the bytes
 * RECEIVED pass `limit`; the declared `Content-Length` is advisory only. The
 * message names the limit — never a byte of the body, which is attacker-chosen.
 */
export class BodyTooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`request body exceeds ${limit} bytes`);
    this.name = "BodyTooLargeError";
  }
}
