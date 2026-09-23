import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import type {
  EventLogPort,
  LogEvent,
  MetricSample,
  ServiceHealthPort,
  ServiceTopology,
  SessionInfo,
  SessionsPort,
} from "@rtc/domain";
import { MAX_LOG_ROWS, METRIC_WINDOW } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import {
  createEventLogPresenter,
  createMetricWindowPresenter,
  createSessionsKpiPresenter,
  createSessionsPresenter,
  createTopologyPresenter,
} from "#/presenters/admin";

describe("admin presenters (effect)", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("metric window: [] synchronously, one window per sample, truncated to the newest METRIC_WINDOW", async () => {
    const samples = new Subject<MetricSample>();
    const presenter = createMetricWindowPresenter(useHost(), samples);
    const seen: (readonly MetricSample[])[] = [];
    const sub = presenter.samples$.subscribe((w) => {
      seen.push(w);
    });

    expect(seen).toEqual([[]]);
    await tick();

    for (let t = 0; t <= METRIC_WINDOW; t += 1) {
      samples.next({ t, value: t });
      await tick();
    }

    const last = seen.at(-1) ?? [];
    expect(last).toHaveLength(METRIC_WINDOW);
    expect(last[0]).toEqual({ t: 1, value: 1 });
    expect(last.at(-1)).toEqual({ t: METRIC_WINDOW, value: METRIC_WINDOW });
    sub.unsubscribe();
  });

  it("metric window: the window and its ONE port subscription survive a full unsubscribe until the host scope closes", async () => {
    const samples = new Subject<MetricSample>();
    const host = useHost();
    const presenter = createMetricWindowPresenter(host, samples);
    presenter.samples$.subscribe(() => {}).unsubscribe();
    await tick();
    samples.next({ t: 1, value: 5 });
    await tick();
    const late: (readonly MetricSample[])[] = [];
    const sub = presenter.samples$.subscribe((w) => {
      late.push(w);
    });

    expect(late).toEqual([[{ t: 1, value: 5 }]]);
    sub.unsubscribe();
    await tick();
    expect(samples.observed).toBe(true);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    expect(samples.observed).toBe(false);
  });

  it("topology: calls the port once, stays silent until it emits, then retains the latest across a full unsubscribe", async () => {
    const topology = new Subject<ServiceTopology>();
    let calls = 0;
    const port: ServiceHealthPort = {
      topology$: () => {
        calls += 1;
        return topology;
      },
    };
    const host = useHost();
    const presenter = createTopologyPresenter(host, port);
    const early: ServiceTopology[] = [];
    presenter.topology$
      .subscribe((t) => {
        early.push(t);
      })
      .unsubscribe();
    await tick();
    expect(early).toEqual([]);

    topology.next(TOPOLOGY);
    await tick();
    const late: ServiceTopology[] = [];
    presenter.topology$
      .subscribe((t) => {
        late.push(t);
      })
      .unsubscribe();

    expect(late).toEqual([TOPOLOGY]);
    expect(calls).toBe(1);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    expect(topology.observed).toBe(false);
  });

  it("sessions: the same retained-mirror shape", async () => {
    const roster = new Subject<readonly SessionInfo[]>();
    const host = useHost();
    const presenter = createSessionsPresenter(host, createSessionsPort(roster));
    presenter.sessions$.subscribe(() => {}).unsubscribe();
    await tick();
    roster.next([SESSION]);
    await tick();
    const late: (readonly SessionInfo[])[] = [];
    presenter.sessions$
      .subscribe((s) => {
        late.push(s);
      })
      .unsubscribe();

    expect(late).toEqual([[SESSION]]);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    expect(roster.observed).toBe(false);
  });

  it("eventLog: newest first, capped at MAX_LOG_ROWS", async () => {
    const events = new Subject<LogEvent>();
    const port: EventLogPort = {
      events$: () => {
        return events;
      },
    };
    const presenter = createEventLogPresenter(useHost(), port);
    const seen: (readonly LogEvent[])[] = [];
    const sub = presenter.events$.subscribe((log) => {
      seen.push(log);
    });

    expect(seen).toEqual([[]]);
    await tick();

    for (let i = 0; i <= MAX_LOG_ROWS; i += 1) {
      events.next(createLogEvent(i));
    }

    await tick();
    const last = seen.at(-1) ?? [];
    expect(last).toHaveLength(MAX_LOG_ROWS);
    expect(last[0]).toEqual(createLogEvent(MAX_LOG_ROWS));
    expect(last.at(-1)).toEqual(createLogEvent(1));
    sub.unsubscribe();
  });

  it("eventLog and sessionsKpi: each keeps its window across a full unsubscribe and releases its port when the host scope closes", async () => {
    const events = new Subject<LogEvent>();
    const roster = new Subject<readonly SessionInfo[]>();
    const host = useHost();
    const port: EventLogPort = {
      events$: () => {
        return events;
      },
    };
    const log = createEventLogPresenter(host, port);
    const kpi = createSessionsKpiPresenter(
      host,
      createSessionsPort(roster),
      () => {
        return 5;
      },
    );
    log.events$.subscribe(() => {}).unsubscribe();
    kpi.countSeries$.subscribe(() => {}).unsubscribe();
    await tick();
    events.next(createLogEvent(1));
    roster.next([SESSION]);
    await tick();
    const lateLog: (readonly LogEvent[])[] = [];
    const lateKpi: (readonly MetricSample[])[] = [];
    log.events$
      .subscribe((l) => {
        lateLog.push(l);
      })
      .unsubscribe();
    kpi.countSeries$
      .subscribe((w) => {
        lateKpi.push(w);
      })
      .unsubscribe();

    expect(lateLog).toEqual([[createLogEvent(1)]]);
    expect(lateKpi).toEqual([[{ t: 5, value: 1 }]]);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    expect(events.observed).toBe(false);
    expect(roster.observed).toBe(false);
  });

  it("sessionsKpi: each roster becomes a sample timestamped by now(), valued by its length", async () => {
    const roster = new Subject<readonly SessionInfo[]>();
    let clock = 1_000;
    const presenter = createSessionsKpiPresenter(
      useHost(),
      createSessionsPort(roster),
      () => {
        return clock;
      },
    );
    const seen: (readonly MetricSample[])[] = [];
    const sub = presenter.countSeries$.subscribe((w) => {
      seen.push(w);
    });
    await tick();
    roster.next([SESSION]);
    await tick();
    clock = 2_000;
    roster.next([SESSION, SESSION]);
    await tick();

    expect(seen).toEqual([
      [],
      [{ t: 1_000, value: 1 }],
      [
        { t: 1_000, value: 1 },
        { t: 2_000, value: 2 },
      ],
    ]);
    sub.unsubscribe();
  });

  const hosts: TestHost[] = [];

  function useHost(): TestHost {
    const host: TestHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

const TOPOLOGY = { nodes: [], edges: [] } as unknown as ServiceTopology;
const SESSION = { id: "s-1" } as unknown as SessionInfo;

function createLogEvent(i: number): LogEvent {
  return { id: `e-${i}` } as unknown as LogEvent;
}

function createSessionsPort(
  roster: Subject<readonly SessionInfo[]>,
): SessionsPort {
  return {
    sessions$: () => {
      return roster;
    },
  };
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
