import { map, type Observable, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { combineEffects } from "#/combineEffects";
import { createWsListener } from "#/createWsListener";
import { matchType, out } from "#/operators";
import type { Inbound, Outbound, Socket } from "#/types";

describe("createWsListener", () => {
  it("sends effect output to the socket", () => {
    const { socket, messages$, sent } = fakeSocket();
    createWsListener(pingPong, undefined)(socket);
    messages$.next({ type: "ping" });
    expect(sent).toEqual([{ type: "pong" }]);
  });

  it("stops sending after the socket closes", () => {
    const { socket, messages$, closed$, sent } = fakeSocket();
    createWsListener(pingPong, undefined)(socket);
    messages$.next({ type: "ping" });
    closed$.next();
    messages$.next({ type: "ping" });
    expect(sent).toEqual([{ type: "pong" }]);
  });

  it("subscribes the inbound stream only once across combined effects", () => {
    const messages$ = new Subject<Inbound>();
    const subscribe = vi.spyOn(messages$, "subscribe");
    const closed$ = new Subject<void>();
    const socket: Socket = {
      messages$,
      closed$,
      send: () => {},
    };
    // combineEffects merges two effects → two independent downstream
    // subscriptions to in$. share() collapses them to ONE upstream
    // subscription of socket.messages$ (verified by mutation: removing
    // share() makes this report 2).
    const effect = combineEffects(pingPong, pongPong);
    createWsListener(effect, undefined)(socket);
    messages$.next({ type: "ping" });
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("releases the upstream subscription when the socket closes", () => {
    const { socket, messages$, closed$ } = fakeSocket();
    createWsListener(combineEffects(pingPong, pongPong), undefined)(socket);
    messages$.next({ type: "ping" });
    expect(messages$.observers.length).toBe(1);
    closed$.next();
    expect(messages$.observers.length).toBe(0);
  });
});

function pingPong(in$: Observable<Inbound>): Observable<Outbound> {
  return in$.pipe(
    matchType("ping"),
    map(() => {
      return out("pong");
    }),
  );
}

function pongPong(in$: Observable<Inbound>): Observable<Outbound> {
  return in$.pipe(
    matchType("ping"),
    map(() => {
      return out("pong2");
    }),
  );
}

interface FakeSocket {
  socket: Socket;
  messages$: Subject<Inbound>;
  closed$: Subject<void>;
  sent: Outbound[];
}

function fakeSocket(): FakeSocket {
  const messages$ = new Subject<Inbound>();
  const closed$ = new Subject<void>();
  const sent: Outbound[] = [];
  const socket: Socket = {
    messages$,
    closed$,
    send: (m: Outbound) => {
      sent.push(m);
    },
  };
  return { socket, messages$, closed$, sent };
}
