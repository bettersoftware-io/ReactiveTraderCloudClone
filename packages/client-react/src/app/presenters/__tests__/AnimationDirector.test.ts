import { BehaviorSubject, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import { ConnectionStatus, type Price } from "@rtc/domain";

import { AnimationDirector, type AnimationIntent } from "../AnimationDirector";

describe("AnimationDirector", () => {
  it("maps a rising price tick to a tickUp intent on the pair's target", () => {
    const eurusd$ = new Subject<Price>();
    const status$ = new Subject<ConnectionStatus>();
    const director = new AnimationDirector({
      priceStreams: { EURUSD: eurusd$ },
      connectionStatus$: status$,
    });

    const seen: AnimationIntent[] = [];
    const sub = director.intentsFor("tile:EURUSD").subscribe((i) => {
      return seen.push(i);
    });

    eurusd$.next({ symbol: "EURUSD", bid: 1.1, ask: 1.1, mid: 1.1 } as Price);
    eurusd$.next({ symbol: "EURUSD", bid: 1.2, ask: 1.2, mid: 1.2 } as Price);
    sub.unsubscribe();

    expect(seen).toEqual([{ target: "tile:EURUSD", kind: "tickUp" }]);
  });

  it("only emits intents for the requested target (filtered)", () => {
    const eurusd$ = new Subject<Price>();
    const status$ = new Subject<ConnectionStatus>();
    const director = new AnimationDirector({
      priceStreams: { EURUSD: eurusd$ },
      connectionStatus$: status$,
    });

    const seen: AnimationIntent[] = [];
    const sub = director.intentsFor("tile:GBPUSD").subscribe((i) => {
      return seen.push(i);
    });
    eurusd$.next({ symbol: "EURUSD", bid: 1.1, ask: 1.1, mid: 1.1 } as Price);
    eurusd$.next({ symbol: "EURUSD", bid: 1.2, ask: 1.2, mid: 1.2 } as Price);
    sub.unsubscribe();
    expect(seen).toEqual([]);
  });

  it("maps a connection-status change to a connectionChange intent", () => {
    // The real presenters.connection.status$ is a shareReplay(1) stream that
    // replays the CURRENT status on subscribe; the director skip(1)s that
    // replayed value so it animates only REAL changes (not the initial paint).
    // Model that here with a BehaviorSubject-like priming emission, then assert
    // the two subsequent transitions each yield a connectionChange intent.
    const status$ = new BehaviorSubject<ConnectionStatus>(
      ConnectionStatus.CONNECTING,
    );
    const director = new AnimationDirector({
      priceStreams: {},
      connectionStatus$: status$,
    });
    const seen: AnimationIntent[] = [];
    const sub = director.intentsFor("banner:connection").subscribe((i) => {
      return seen.push(i);
    });
    status$.next(ConnectionStatus.CONNECTED);
    status$.next(ConnectionStatus.DISCONNECTED);
    sub.unsubscribe();
    expect(seen).toEqual([
      { target: "banner:connection", kind: "connectionChange" },
      { target: "banner:connection", kind: "connectionChange" },
    ]);
  });
});
