import { Observable, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { PreferencesPort } from "@rtc/domain";
import { CLIENT_MSG } from "@rtc/shared";

import { FakeWsAdapter } from "../adapters/__tests__/FakeWsAdapter";
import { createWsRealPorts } from "../adapters/portFactory";
import { CurrencyPairsPresenter } from "./CurrencyPairsPresenter";
import { warmReplay } from "./warmReplay.js";

describe("warmReplay", () => {
  it("subscribes its source once and holds it across refCount cycles", () => {
    let sourceSubscribes = 0;
    const inner = new Subject<number>();
    const warm$ = new Observable<number>((o) => {
      sourceSubscribes += 1;
      const s = inner.subscribe(o);

      return (): void => {
        s.unsubscribe();
      };
    }).pipe(warmReplay());

    warm$.subscribe().unsubscribe(); // mount + unmount
    warm$.subscribe().unsubscribe(); // remount + unmount
    warm$.subscribe(); // remount

    // refCount:true would re-subscribe the source each cycle (3×); warmReplay
    // holds it open, so the source is subscribed exactly once.
    expect(sourceSubscribes).toBe(1);
    expect(inner.observed).toBe(true);
  });

  it("replays the latest value to a subscriber that arrives after an update", () => {
    const inner = new Subject<number>();
    const warm$ = inner.pipe(warmReplay());

    const keepWarm = warm$.subscribe();
    inner.next(41);
    inner.next(42);

    let seen: number | undefined;
    warm$.subscribe((v) => {
      seen = v;
    });
    expect(seen).toBe(42); // latest state-of-the-world retained

    keepWarm.unsubscribe();
  });

  it("a singleton presenter re-subscribed after teardown sends ONE wire subscribe, not one per cycle", () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws, { preferences: {} as PreferencesPort });
    const presenter = new CurrencyPairsPresenter(ports.referenceData);

    presenter.pairs$.subscribe().unsubscribe(); // tab switch away + back
    presenter.pairs$.subscribe().unsubscribe();
    presenter.pairs$.subscribe();

    const subs = ws.sentMessages().filter((m) => {
      return m.type === CLIENT_MSG.SUBSCRIBE_REFERENCE_DATA;
    }).length;
    expect(subs).toBe(1);
  });
});
