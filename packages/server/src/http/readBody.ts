import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";

import { BodyTooLargeError } from "./BodyTooLargeError.js";

export { BodyTooLargeError } from "./BodyTooLargeError.js";

/**
 * Reads a request body, counting bytes as they ARRIVE; past `maxBytes` the
 * request is destroyed (so the client stops sending) and the promise rejects
 * with {@link BodyTooLargeError}. `Content-Length` is never consulted — a
 * header that lies low must not buy a bigger body. The resolved string is
 * UTF-8.
 */
export function readBodyWithLimit(
  req: Readable,
  maxBytes: number,
): Promise<string> {
  return new Promise((resolve, reject): void => {
    const chunks: Buffer[] = [];
    let received = 0;

    req.on("data", (chunk: Buffer): void => {
      received += chunk.length;

      if (received > maxBytes) {
        req.destroy();
        reject(new BodyTooLargeError(maxBytes));

        return;
      }

      chunks.push(chunk);
    });
    req.on("end", (): void => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

/**
 * Cheap early rejection for a route whose body is read by someone else (the
 * MCP transport): true when the client DECLARES more than `maxBytes`. A
 * missing or unparseable header is not a violation — the reader must still
 * count.
 */
export function declaredLengthExceeds(
  headers: IncomingHttpHeaders,
  maxBytes: number,
): boolean {
  const raw = headers["content-length"];
  const declared = Number(Array.isArray(raw) ? raw[0] : raw);

  return Number.isFinite(declared) && declared > maxBytes;
}
