import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";

import { BodyTooLargeError } from "./BodyTooLargeError.js";

export { BodyTooLargeError } from "./BodyTooLargeError.js";

/**
 * Reads a request body, counting bytes as they ARRIVE; past `maxBytes` the
 * reader stops consuming (listener removed, stream paused) and the promise rejects
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
        // Stop reading, but do NOT destroy: destroying an IncomingMessage
        // tears down the socket before the caller can answer 413, and the
        // client sees a dropped connection instead of a status. The caller
        // answers with `Connection: close`; Node then closes the socket with
        // the rest of the body unread.
        req.removeAllListeners("data");
        req.pause();
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
