import { fromEvent, map, Observable, take } from "rxjs";
import type { WebSocket } from "ws";

import type { Inbound, Outbound, Socket } from "@rtc/ws-effects";

export function toSocket(ws: WebSocket): Socket {
  const messages$ = new Observable<Inbound>((subscriber) => {
    function onMessage(data: unknown): void {
      try {
        subscriber.next(JSON.parse(String(data)) as Inbound);
      } catch {
        // ignore unparseable frames (parity with the old handler)
      }
    }

    ws.on("message", onMessage);

    return () => {
      ws.off("message", onMessage);
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
