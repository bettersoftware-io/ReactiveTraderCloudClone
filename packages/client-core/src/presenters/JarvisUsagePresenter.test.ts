import { type Observable, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { JarvisUsageSnapshot } from "@rtc/shared";

import type { JarvisUsagePort } from "#/adapters/jarvisUsagePort";

import { JarvisUsagePresenter } from "./JarvisUsagePresenter";

const SNAPSHOT: JarvisUsageSnapshot = {
  windowStartMs: 1_000,
  windowEndMs: 2_000,
  currentWindow: [],
  sinceBoot: [],
};

/** A JarvisUsagePort test double whose `usage$()` is a plain pass-through of
 * an injected Subject, and which counts how many times `usage$()` itself was
 * invoked (to prove warmReplay's single-subscription behaviour). */
// eslint-disable-next-line rtc/class-filename-match -- small local JarvisUsagePort stub; file is named after the system under test
class FakeJarvisUsagePort implements JarvisUsagePort {
  callCount = 0;

  constructor(private readonly source$: Subject<JarvisUsageSnapshot>) {}

  usage$(): Observable<JarvisUsageSnapshot> {
    this.callCount += 1;
    return this.source$.asObservable();
  }
}

describe("JarvisUsagePresenter", () => {
  it("starts with null before the port emits its first snapshot", () => {
    const source$ = new Subject<JarvisUsageSnapshot>();
    const presenter = new JarvisUsagePresenter(
      new FakeJarvisUsagePort(source$),
    );

    let seen: JarvisUsageSnapshot | null | undefined;
    const sub = presenter.usage$.subscribe((v) => {
      seen = v;
    });

    expect(seen).toBeNull();
    sub.unsubscribe();
  });

  it("forwards the port's snapshot once it arrives", () => {
    const source$ = new Subject<JarvisUsageSnapshot>();
    const presenter = new JarvisUsagePresenter(
      new FakeJarvisUsagePort(source$),
    );

    const seen: Array<JarvisUsageSnapshot | null> = [];
    const sub = presenter.usage$.subscribe((v) => {
      seen.push(v);
    });

    source$.next(SNAPSHOT);

    expect(seen).toEqual([null, SNAPSHOT]);
    sub.unsubscribe();
  });

  it("replays the latest snapshot to a subscriber that arrives after an update, without a fresh port.usage$() call", () => {
    const source$ = new Subject<JarvisUsageSnapshot>();
    const port = new FakeJarvisUsagePort(source$);
    const presenter = new JarvisUsagePresenter(port);

    const keepWarm = presenter.usage$.subscribe();
    source$.next(SNAPSHOT);

    let seen: JarvisUsageSnapshot | null | undefined;
    presenter.usage$.subscribe((v) => {
      seen = v;
    });

    expect(seen).toEqual(SNAPSHOT);
    // One warmReplay-held subscription for the whole presenter lifetime —
    // not one per UI subscriber (the Admin tab's key={activeTab} remount
    // pattern this mirrors ServiceTopologyPresenter/warmReplay for).
    expect(port.callCount).toBe(1);
    keepWarm.unsubscribe();
  });

  it("a subscribe/unsubscribe cycle (tab switch away + back) does not re-invoke port.usage$()", () => {
    const source$ = new Subject<JarvisUsageSnapshot>();
    const port = new FakeJarvisUsagePort(source$);
    const presenter = new JarvisUsagePresenter(port);

    presenter.usage$.subscribe().unsubscribe();
    presenter.usage$.subscribe().unsubscribe();
    presenter.usage$.subscribe();

    expect(port.callCount).toBe(1);
  });
});
