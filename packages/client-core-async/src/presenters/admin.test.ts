import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

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

import {
  createEventLogPresenter,
  createMetricWindowPresenter,
  createSessionsKpiPresenter,
  createSessionsPresenter,
  createTopologyPresenter,
} from "#/presenters/admin";

describe("admin presenters (async)", () => {
  it("metric window: [] synchronously, one window per sample, truncated to the newest METRIC_WINDOW", () => {
    const samples = new Subject<MetricSample>();
    const presenter = createMetricWindowPresenter(
      samples,
      new AbortController().signal,
    );
    const seen: (readonly MetricSample[])[] = [];
    const sub = presenter.samples$.subscribe((w) => {
      seen.push(w);
    });

    expect(seen).toEqual([[]]);

    for (let t = 0; t <= METRIC_WINDOW; t += 1) {
      samples.next({ t, value: t });
    }

    const last = seen.at(-1) ?? [];
    expect(last).toHaveLength(METRIC_WINDOW);
    expect(last[0]).toEqual({ t: 1, value: 1 });
    expect(last.at(-1)).toEqual({ t: METRIC_WINDOW, value: METRIC_WINDOW });
    sub.unsubscribe();
  });

  it("metric window: the window and its ONE port subscription survive a full unsubscribe until the lifetime aborts", () => {
    const samples = new Subject<MetricSample>();
    const lifetime = new AbortController();
    const presenter = createMetricWindowPresenter(samples, lifetime.signal);
    presenter.samples$.subscribe(() => {}).unsubscribe();
    samples.next({ t: 1, value: 5 });
    const late: (readonly MetricSample[])[] = [];
    const sub = presenter.samples$.subscribe((w) => {
      late.push(w);
    });

    expect(late).toEqual([[{ t: 1, value: 5 }]]);
    sub.unsubscribe();
    expect(samples.observed).toBe(true);
    lifetime.abort();
    expect(samples.observed).toBe(false);
  });

  it("topology: calls the port once, stays silent until it emits, then retains the latest across a full unsubscribe", () => {
    const topology = new Subject<ServiceTopology>();
    let calls = 0;
    const port: ServiceHealthPort = {
      topology$: () => {
        calls += 1;
        return topology;
      },
    };
    const lifetime = new AbortController();
    const presenter = createTopologyPresenter(port, lifetime.signal);
    const early: ServiceTopology[] = [];
    presenter.topology$
      .subscribe((t) => {
        early.push(t);
      })
      .unsubscribe();
    expect(early).toEqual([]);

    topology.next(TOPOLOGY);
    const late: ServiceTopology[] = [];
    presenter.topology$
      .subscribe((t) => {
        late.push(t);
      })
      .unsubscribe();

    expect(late).toEqual([TOPOLOGY]);
    expect(calls).toBe(1);
    lifetime.abort();
    expect(topology.observed).toBe(false);
  });

  it("sessions: the same warm-mirror shape", () => {
    const roster = new Subject<readonly SessionInfo[]>();
    const lifetime = new AbortController();
    const presenter = createSessionsPresenter(
      createSessionsPort(roster),
      lifetime.signal,
    );
    presenter.sessions$.subscribe(() => {}).unsubscribe();
    roster.next([SESSION]);
    const late: (readonly SessionInfo[])[] = [];
    presenter.sessions$
      .subscribe((s) => {
        late.push(s);
      })
      .unsubscribe();

    expect(late).toEqual([[SESSION]]);
    lifetime.abort();
    expect(roster.observed).toBe(false);
  });

  it("eventLog: newest first, capped at MAX_LOG_ROWS", () => {
    const events = new Subject<LogEvent>();
    const port: EventLogPort = {
      events$: () => {
        return events;
      },
    };

    const presenter = createEventLogPresenter(
      port,
      new AbortController().signal,
    );
    const seen: (readonly LogEvent[])[] = [];
    const sub = presenter.events$.subscribe((log) => {
      seen.push(log);
    });

    expect(seen).toEqual([[]]);

    for (let i = 0; i <= MAX_LOG_ROWS; i += 1) {
      events.next(createLogEvent(i));
    }

    const last = seen.at(-1) ?? [];
    expect(last).toHaveLength(MAX_LOG_ROWS);
    expect(last[0]).toEqual(createLogEvent(MAX_LOG_ROWS));
    expect(last.at(-1)).toEqual(createLogEvent(1));
    sub.unsubscribe();
  });

  it("eventLog and sessionsKpi: each keeps its window across a full unsubscribe and releases its port on the lifetime abort", () => {
    const events = new Subject<LogEvent>();
    const roster = new Subject<readonly SessionInfo[]>();
    const lifetime = new AbortController();
    const port: EventLogPort = {
      events$: () => {
        return events;
      },
    };
    const log = createEventLogPresenter(port, lifetime.signal);
    const kpi = createSessionsKpiPresenter(
      createSessionsPort(roster),
      lifetime.signal,
      () => {
        return 5;
      },
    );
    log.events$.subscribe(() => {}).unsubscribe();
    kpi.countSeries$.subscribe(() => {}).unsubscribe();
    events.next(createLogEvent(1));
    roster.next([SESSION]);
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
    lifetime.abort();
    expect(events.observed).toBe(false);
    expect(roster.observed).toBe(false);
  });

  it("sessionsKpi: each roster becomes a sample timestamped by now() at emission, valued by its length", () => {
    const roster = new Subject<readonly SessionInfo[]>();
    let clock = 1_000;
    const presenter = createSessionsKpiPresenter(
      createSessionsPort(roster),
      new AbortController().signal,
      () => {
        return clock;
      },
    );
    const seen: (readonly MetricSample[])[] = [];
    const sub = presenter.countSeries$.subscribe((w) => {
      seen.push(w);
    });
    roster.next([SESSION]);
    clock = 2_000;
    roster.next([SESSION, SESSION]);

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
});

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
