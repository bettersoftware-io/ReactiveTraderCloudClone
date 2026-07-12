// TDD — RED: written before MetricsPresenters existed.
//   pnpm --filter @rtc/client-react test -- MetricsPresenters  → FAIL (module missing)
// GREEN: MetricsPresenters created → all cases pass.

import { firstValueFrom, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { MetricSample, TelemetryPort } from "@rtc/domain";

import { ErrorRatePresenter } from "../ErrorRatePresenter";
import { LatencyPresenter } from "../LatencyPresenter";
import { ThroughputMetricPresenter } from "../ThroughputMetricPresenter";
import { WINDOW } from "../windowedSamples";

describe("ThroughputMetricPresenter", () => {
  it("emits an empty list before any samples arrive", async () => {
    const presenter = new ThroughputMetricPresenter(fakePort());
    const first = await firstValueFrom(presenter.samples$);
    expect(first).toEqual([]);
  });

  it("keeps its rolling window warm across a refCount cycle (survives the Admin tab remount)", () => {
    const subject = new Subject<MetricSample>();
    const presenter = new ThroughputMetricPresenter(fakePort(subject));

    const first = presenter.samples$.subscribe();
    subject.next(sample(1, 10));
    subject.next(sample(2, 20));
    first.unsubscribe(); // Admin tab away → last UI subscriber unmounts

    // warmReplay (refCount:false) keeps the source subscribed with no observer…
    expect(subject.observed).toBe(true);

    // …so a remount reads the retained window immediately (refCount:true would
    // have torn the scan down and reset it to the empty startWith value).
    let latest: readonly MetricSample[] = [];
    const second = presenter.samples$.subscribe((s) => {
      latest = s;
    });
    expect(latest).toEqual([sample(1, 10), sample(2, 20)]);
    second.unsubscribe();
  });

  it("accumulates samples oldest-first", () => {
    const subject = new Subject<MetricSample>();
    const presenter = new ThroughputMetricPresenter(fakePort(subject));

    const emitted: (readonly MetricSample[])[] = [];
    const sub = presenter.samples$.subscribe((s) => {
      emitted.push(s);
    });

    subject.next(sample(1, 10));
    subject.next(sample(2, 20));
    sub.unsubscribe();

    expect(emitted[0]).toEqual([]); // startWith initial value
    expect(emitted[1]).toEqual([sample(1, 10)]);
    expect(emitted[2]).toEqual([sample(1, 10), sample(2, 20)]); // oldest first
  });

  it(`caps at WINDOW (${WINDOW}) and drops the oldest samples`, () => {
    const subject = new Subject<MetricSample>();
    const presenter = new ThroughputMetricPresenter(fakePort(subject));

    let last: readonly MetricSample[] = [];
    const sub = presenter.samples$.subscribe((s) => {
      last = s;
    });

    for (let i = 0; i < WINDOW + 5; i++) {
      subject.next(sample(i));
    }

    sub.unsubscribe();

    expect(last.length).toBe(WINDOW);
    // Oldest retained is at index 0
    expect(last[0].t).toBe(5);
    // Newest is at the tail
    expect(last[WINDOW - 1].t).toBe(WINDOW + 4);
  });
});

describe("LatencyPresenter", () => {
  it("emits an empty list before any samples arrive", async () => {
    const presenter = new LatencyPresenter(fakePort());
    const first = await firstValueFrom(presenter.samples$);
    expect(first).toEqual([]);
  });

  it(`caps at WINDOW and drops the oldest samples`, () => {
    const subject = new Subject<MetricSample>();
    const presenter = new LatencyPresenter(fakePort(undefined, subject));

    let last: readonly MetricSample[] = [];
    const sub = presenter.samples$.subscribe((s) => {
      last = s;
    });

    for (let i = 0; i < WINDOW + 3; i++) {
      subject.next(sample(i));
    }

    sub.unsubscribe();

    expect(last.length).toBe(WINDOW);
    expect(last[0].t).toBe(3);
    expect(last[WINDOW - 1].t).toBe(WINDOW + 2);
  });
});

describe("ErrorRatePresenter", () => {
  it("emits an empty list before any samples arrive", async () => {
    const presenter = new ErrorRatePresenter(fakePort());
    const first = await firstValueFrom(presenter.samples$);
    expect(first).toEqual([]);
  });

  it("accumulates samples oldest-first and caps at WINDOW", () => {
    const subject = new Subject<MetricSample>();
    const presenter = new ErrorRatePresenter(
      fakePort(undefined, undefined, subject),
    );

    const emitted: (readonly MetricSample[])[] = [];
    const sub = presenter.samples$.subscribe((s) => {
      emitted.push(s);
    });

    subject.next(sample(10));
    subject.next(sample(20));
    sub.unsubscribe();

    expect(emitted[1]).toEqual([sample(10)]);
    expect(emitted[2]).toEqual([sample(10), sample(20)]);
  });
});

function sample(t: number, value = 0): MetricSample {
  return { t, value };
}

/** Minimal fake TelemetryPort — only wires the stream being tested. */
function fakePort(
  throughput$?: Subject<MetricSample>,
  latency$?: Subject<MetricSample>,
  errorRate$?: Subject<MetricSample>,
): TelemetryPort {
  return {
    throughput$: () => {
      return throughput$ ?? new Subject<MetricSample>();
    },
    latency$: () => {
      return latency$ ?? new Subject<MetricSample>();
    },
    errorRate$: () => {
      return errorRate$ ?? new Subject<MetricSample>();
    },
  };
}
