// TDD — RED: written before SessionsKpiPresenter existed.
//   pnpm --filter @rtc/client-core test -- SessionsKpiPresenter  → FAIL (module missing)
// GREEN: SessionsKpiPresenter created → all cases pass.

import { firstValueFrom, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricSample, SessionInfo, SessionsPort } from "@rtc/domain";

import { SessionsKpiPresenter } from "../SessionsKpiPresenter";
import { WINDOW } from "../windowedSamples";

describe("SessionsKpiPresenter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits an empty series before any sessions arrive", async () => {
    const presenter = new SessionsKpiPresenter(fakePort());
    const first = await firstValueFrom(presenter.countSeries$);
    expect(first).toEqual([]);
  });

  it("maps each sessions emission to a MetricSample of the session count", () => {
    vi.setSystemTime(1_000);
    const subject = new Subject<readonly SessionInfo[]>();
    const presenter = new SessionsKpiPresenter(fakePort(subject));

    const emitted: (readonly MetricSample[])[] = [];
    const sub = presenter.countSeries$.subscribe((s) => {
      emitted.push(s);
    });

    subject.next([session("a"), session("b")]);
    vi.setSystemTime(2_000);
    subject.next([session("a"), session("b"), session("c")]);
    sub.unsubscribe();

    expect(emitted[0]).toEqual([]); // startWith initial value
    expect(emitted[1]).toEqual([{ t: 1_000, value: 2 }]);
    expect(emitted[2]).toEqual([
      { t: 1_000, value: 2 },
      { t: 2_000, value: 3 },
    ]);
  });

  it(`caps at WINDOW (${WINDOW}) and drops the oldest samples`, () => {
    const subject = new Subject<readonly SessionInfo[]>();
    const presenter = new SessionsKpiPresenter(fakePort(subject));

    let last: readonly MetricSample[] = [];
    const sub = presenter.countSeries$.subscribe((s) => {
      last = s;
    });

    for (let i = 0; i < WINDOW + 5; i++) {
      vi.setSystemTime(i);
      subject.next([session(`s${i}`)]);
    }

    sub.unsubscribe();

    expect(last.length).toBe(WINDOW);
    expect(last[0].t).toBe(5);
    expect(last[WINDOW - 1].t).toBe(WINDOW + 4);
  });

  // Regression for the same-class bug EventLogPresenter's doc comment
  // describes: the Admin KPI row is the sole consumer, and App.tsx remounts a
  // tab's whole subtree on switch, unsubscribing it. The rolling series must
  // survive that unsubscribe/resubscribe, not reset to [].
  it("survives unsubscribe/resubscribe (tab remount) without losing accumulated samples", () => {
    vi.setSystemTime(1);
    const subject = new Subject<readonly SessionInfo[]>();
    const presenter = new SessionsKpiPresenter(fakePort(subject));

    const sub1 = presenter.countSeries$.subscribe(() => {});
    subject.next([session("a")]);
    vi.setSystemTime(2);
    subject.next([session("a"), session("b")]);
    sub1.unsubscribe();

    const secondRun: (readonly MetricSample[])[] = [];
    const sub2 = presenter.countSeries$.subscribe((s) => {
      secondRun.push(s);
    });

    // shareReplay(1) immediately replays the last buffered value.
    expect(secondRun[0]).toEqual([
      { t: 1, value: 1 },
      { t: 2, value: 2 },
    ]);

    vi.setSystemTime(3);
    subject.next([session("a"), session("b"), session("c")]);
    expect(secondRun.at(-1)).toEqual([
      { t: 1, value: 1 },
      { t: 2, value: 2 },
      { t: 3, value: 3 },
    ]);

    sub2.unsubscribe();
  });

  it("multicasts to multiple subscribers (shareReplay — single port subscription)", () => {
    let subscribed = 0;
    const subject = new Subject<readonly SessionInfo[]>();
    const port: SessionsPort = {
      sessions$: () => {
        subscribed++;
        return subject;
      },
    };
    const presenter = new SessionsKpiPresenter(port);

    const a: (readonly MetricSample[])[] = [];
    const b: (readonly MetricSample[])[] = [];
    const subA = presenter.countSeries$.subscribe((s) => {
      a.push(s);
    });

    const subB = presenter.countSeries$.subscribe((s) => {
      b.push(s);
    });

    subject.next([session("x")]);
    subA.unsubscribe();
    subB.unsubscribe();

    expect(subscribed).toBe(1);
    expect(a).toEqual(b);
  });
});

function session(id: string): SessionInfo {
  return { id, user: "demo-user", region: "EU", lat: 51.5, lon: -0.1 };
}

function fakePort(sessions$?: Subject<readonly SessionInfo[]>): SessionsPort {
  return {
    sessions$: () => {
      return sessions$ ?? new Subject<readonly SessionInfo[]>();
    },
  };
}
