import { fromEvent, map, Observable, take } from "rxjs";
import type { WebSocket } from "ws";

import type { Inbound, Outbound, Socket } from "@rtc/ws-effects";

import type { TokenBucket } from "./tokenBucket.js";

/** S8 — the per-socket inbound rate guard `toSocket` applies ahead of parsing. */
export interface InboundGuardOptions {
  readonly bucket: TokenBucket;
  /** Dropped frames tolerated before the socket is closed as a flood. */
  readonly dropsBeforeClose: number;
  readonly now: () => number;
  /** Fired once, when the socket is closed for flooding. */
  readonly onFlood: () => void;
}

/**
 * Adapts a `ws` socket to the ws-effects `Socket`. With a `guard`, every
 * inbound frame — parseable or not — takes one token before anything else;
 * a frame without a token is dropped, and the `dropsBeforeClose`-th drop
 * closes the socket with `1008 "message rate exceeded"` and reports the
 * flood exactly once. Without a `guard` nothing is rate-limited.
 */
export function toSocket(ws: WebSocket, guard?: InboundGuardOptions): Socket {
  let drops = 0;
  let flooded = false;

  const messages$ = new Observable<Inbound>((subscriber) => {
    function emitParsedFrame(data: unknown): void {
      if (guard !== undefined && !guard.bucket.tryTake(guard.now())) {
        drops += 1;

        if (drops >= guard.dropsBeforeClose && !flooded) {
          flooded = true;
          guard.onFlood();
          ws.close(1008, "message rate exceeded");
        }

        return;
      }

      try {
        subscriber.next(JSON.parse(String(data)) as Inbound);
      } catch {
        // ignore unparseable frames (parity with the old handler)
      }
    }

    ws.on("message", emitParsedFrame);

    return () => {
      ws.off("message", emitParsedFrame);
    };
  });

  const closed$ = fromEvent(ws, "close").pipe(
    take(1),
    map(() => {
      return undefined;
    }),
  );

  return {
    messages$,
    closed$,
    send: (message: Outbound): void => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },
  };
}
