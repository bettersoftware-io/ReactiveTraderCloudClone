import type { Observable, Subscription } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricSample } from "../telemetry/metrics.js";
import { AnalyticsSimulator } from "./AnalyticsSimulator.js";
import { EquityMarketDataSimulator } from "./EquityMarketDataSimulator.js";
import { ErrorRateSimulator } from "./ErrorRateSimulator.js";
import { LatencySimulator } from "./LatencySimulator.js";
import { METRIC_HISTORY_LEN, METRIC_TICK_MS } from "./metricWalk.js";
import { ServiceTopologySimulator } from "./ServiceTopologySimulator.js";
import { mulberry32 } from "./seededRandom.js";
import { TelemetrySimulator } from "./TelemetrySimulator.js";
import { ThroughputSimulator } from "./ThroughputSimulator.js";

/**
 * Every simulator whose live loop advances state the simulator owns. A loop
 * per subscriber would advance that state once per subscriber, so each case
 * here must behave as ONE walk however many readers it has — the rule
 * `PricingSimulator` already keeps (see its own shared-walk cases).
 */
const CASES: readonly SharedWalkCase[] = [
  {
    name: "EquityMarketDataSimulator.quotes",
    tickMs: 500,
    createStream: () => {
      const simulator = new EquityMarketDataSimulator();

      return () => {
        return simulator.quotes("AAPL");
      };
    },
  },
  {
    name: "AnalyticsSimulator.getAnalytics",
    tickMs: 10_000,
    createStream: () => {
      const simulator = new AnalyticsSimulator();

      return () => {
        return simulator.getAnalytics("USD");
      };
    },
  },
  {
    name: "ServiceTopologySimulator.topology$",
    tickMs: 2_000,
    createStream: () => {
      const simulator = new ServiceTopologySimulator();

      return () => {
        return simulator.topology$();
      };
    },
  },
  {
    name: "LatencySimulator.latency$",
    tickMs: METRIC_TICK_MS,
    createStream: () => {
      const simulator = new LatencySimulator();

      return () => {
        return simulator.latency$();
      };
    },
  },
  {
    name: "ErrorRateSimulator.errorRate$",
    tickMs: METRIC_TICK_MS,
    createStream: () => {
      const simulator = new ErrorRateSimulator();

      return () => {
        return simulator.errorRate$();
      };
    },
  },
  {
    name: "TelemetrySimulator.throughput$",
    tickMs: METRIC_TICK_MS,
    createStream: () => {
      const simulator = new TelemetrySimulator(
        new ThroughputSimulator(),
        new LatencySimulator(),
        new ErrorRateSimulator(),
      );

      return () => {
        return simulator.throughput$();
      };
    },
  },
];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each(CASES)("$name is one walk for every subscriber", (walk) => {
  it("a second and a late subscriber change nothing the first one hears", async () => {
    const alone = await createRun(walk, { companions: false });
    const accompanied = await createRun(walk, { companions: true });

    expect(alone.first.length).toBeGreaterThan(TICKS);
    expect(accompanied.first).toEqual(alone.first);
  });

  it("subscribers that start together hear the same values", async () => {
    const run = await createRun(walk, { companions: true });

    expect(run.second).toEqual(run.first);
  });

  it("a subscriber joining a running walk picks it up where it is, then hears each next value once", async () => {
    const run = await createRun(walk, { companions: true });

    expect(run.late.length).toBeGreaterThan(TICKS - TICKS_BEFORE_JOIN);
    expect(run.late).toEqual(run.first.slice(-run.late.length));
  });

  it("the walk outlives one subscriber and stops with the last", async () => {
    const stream = walk.createStream();
    const heard: unknown[] = [];
    const leaver = stream().subscribe();
    const stayer = stream().subscribe((value) => {
      heard.push(value);
    });
    const heardOnSubscribe = heard.length;

    leaver.unsubscribe();
    await vi.advanceTimersByTimeAsync(walk.tickMs * 2);
    expect(heard).toHaveLength(heardOnSubscribe + 2);

    stayer.unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe.each(
  CASES.filter((walk) => {
    return walk.tickMs === METRIC_TICK_MS;
  }),
)("$name after its walk has stopped", (walk) => {
  it("gives the next subscriber a fresh history that ends now, not the stopped walk's window", async () => {
    const stream = walk.createStream();
    stream().subscribe().unsubscribe();
    await vi.advanceTimersByTimeAsync(METRIC_TICK_MS * 30);

    const history: MetricSample[] = [];
    stream()
      .subscribe((sample) => {
        history.push(sample as MetricSample);
      })
      .unsubscribe();

    expect(history).toHaveLength(METRIC_HISTORY_LEN);
    expect(history.at(-1)?.t).toBe(Date.now());
  });
});

const TICKS = 6;
const TICKS_BEFORE_JOIN = 2;

interface SharedWalkCase {
  readonly name: string;
  readonly tickMs: number;
  /** A fresh simulator behind a function that subscribes to its stream. */
  readonly createStream: () => () => Observable<unknown>;
}

interface RunOptions {
  /** A second subscriber from the start and a third joining mid-run. */
  readonly companions: boolean;
}

interface Run {
  readonly first: readonly unknown[];
  readonly second: readonly unknown[];
  readonly late: readonly unknown[];
}

/**
 * One scripted session on a fresh simulator, from the same clock reading and
 * the same random sequence every time, so two runs differ only in who else
 * was listening. With `companions`, a second subscriber starts with the first
 * and a third joins after `TICKS_BEFORE_JOIN` ticks.
 */
async function createRun(
  walk: SharedWalkCase,
  options: RunOptions,
): Promise<Run> {
  vi.setSystemTime(0);
  vi.spyOn(Math, "random").mockImplementation(mulberry32(7));

  const stream = walk.createStream();
  const first: unknown[] = [];
  const second: unknown[] = [];
  const late: unknown[] = [];
  const subscriptions: Subscription[] = [
    stream().subscribe((value) => {
      first.push(value);
    }),
  ];

  if (options.companions) {
    subscriptions.push(
      stream().subscribe((value) => {
        second.push(value);
      }),
    );
  }

  await vi.advanceTimersByTimeAsync(walk.tickMs * TICKS_BEFORE_JOIN);

  if (options.companions) {
    subscriptions.push(
      stream().subscribe((value) => {
        late.push(value);
      }),
    );
  }

  await vi.advanceTimersByTimeAsync(walk.tickMs * (TICKS - TICKS_BEFORE_JOIN));

  for (const subscription of subscriptions) {
    subscription.unsubscribe();
  }

  return { first, second, late };
}
