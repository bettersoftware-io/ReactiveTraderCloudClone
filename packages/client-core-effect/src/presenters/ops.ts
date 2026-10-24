import { Option, Stream } from "effect";

import type {
  Stream as CoreStream,
  EventLogPresenter,
  ServiceTopologyPresenter,
  SessionsKpiPresenter,
  SessionsPresenter,
} from "@rtc/core-api";
import { appendMetricSample, prependLogEvent } from "@rtc/core-logic";
import type {
  EventLogPort,
  LogEvent,
  MetricSample,
  ServiceHealthPort,
  SessionInfo,
  SessionsPort,
} from "@rtc/domain";

import {
  type EffectHost,
  type FoldUpdate,
  type FromPort,
  sharedFold,
} from "#/bridge/out";
import { mirrorPortAsIs } from "#/presenters/mirrorPort";

/** The three rolling KPI windows share one presenter shape. */
export interface MetricWindowPresenter {
  readonly samples$: CoreStream<readonly MetricSample[]>;
}

/** A warm fold of a port stream: `initial` on the first subscriber, one
 * accumulator per port value, RETAINED across zero subscribers until the
 * host scope closes — the RxJS core's `scan` + `startWith` + `warmReplay()`.
 * `source` is the port method's result, so the method is called once, by
 * the caller, at construction; the retained period subscribes it once. */
function warmFold<T, S>(
  host: EffectHost,
  source: CoreStream<T>,
  initial: S,
  step: (accumulator: S, value: T) => S,
): CoreStream<S> {
  return sharedFold<S>(host, {
    retain: true,
    seed: () => {
      return Option.some(initial);
    },
    run: (update: FoldUpdate<S>, fromPort: FromPort) => {
      return fromPort(source).pipe(
        Stream.runForEach((value) => {
          return update((current) => {
            return step(
              Option.getOrElse(current, () => {
                return initial;
              }),
              value,
            );
          });
        }),
      );
    },
  });
}

/** A metric port stream as a rolling window of the last `METRIC_WINDOW`
 * samples — the RxJS core's `windowedSamples`. */
export function createMetricWindowPresenter(
  host: EffectHost,
  source: CoreStream<MetricSample>,
): MetricWindowPresenter {
  return {
    samples$: warmFold<MetricSample, readonly MetricSample[]>(
      host,
      source,
      [],
      appendMetricSample,
    ),
  };
}

/** The service topology — a retained mirror: silent until the port emits,
 * then the latest topology kept until the host scope closes. */
export function createTopologyPresenter(
  host: EffectHost,
  serviceHealth: ServiceHealthPort,
): ServiceTopologyPresenter {
  return {
    topology$: mirrorPortAsIs(host, serviceHealth.topology$(), {
      retain: true,
    }),
  };
}

/** The live session roster — the same retained-mirror shape. */
export function createSessionsPresenter(
  host: EffectHost,
  sessions: SessionsPort,
): SessionsPresenter {
  return {
    sessions$: mirrorPortAsIs(host, sessions.sessions$(), { retain: true }),
  };
}

/** The rolling event log, newest first, capped at `MAX_LOG_ROWS`. */
export function createEventLogPresenter(
  host: EffectHost,
  eventLog: EventLogPort,
): EventLogPresenter {
  return {
    events$: warmFold<LogEvent, readonly LogEvent[]>(
      host,
      eventLog.events$(),
      [],
      prependLogEvent,
    ),
  };
}

/** The session count as a rolling KPI window: each roster becomes a sample
 * `{ t: now(), value: roster.length }`, timestamped at emission. `now` is
 * injectable for the unit tests; the contract drives the fake system clock. */
export function createSessionsKpiPresenter(
  host: EffectHost,
  sessions: SessionsPort,
  now: () => number = Date.now,
): SessionsKpiPresenter {
  return {
    countSeries$: warmFold<readonly SessionInfo[], readonly MetricSample[]>(
      host,
      sessions.sessions$(),
      [],
      (window, roster) => {
        return appendMetricSample(window, { t: now(), value: roster.length });
      },
    ),
  };
}
