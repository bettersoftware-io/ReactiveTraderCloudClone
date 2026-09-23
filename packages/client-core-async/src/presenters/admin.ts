import type {
  EventLogPresenter,
  ServiceTopologyPresenter,
  SessionsKpiPresenter,
  SessionsPresenter,
  Stream,
} from "@rtc/core-api";
import { appendMetricSample, prependLogEvent } from "@rtc/client-core";
import type {
  EventLogPort,
  LogEvent,
  MetricSample,
  ServiceHealthPort,
  SessionInfo,
  SessionsPort,
} from "@rtc/domain";

import { topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";
import { foldTopic } from "#/kernel/foldTopic";

/** The three rolling KPI windows share one presenter shape. */
export interface MetricWindowPresenter {
  readonly samples$: Stream<readonly MetricSample[]>;
}

/** A metric port stream as a rolling window of the last `METRIC_WINDOW`
 * samples — a warm fold: `[]` synchronously on the first subscriber, one
 * window per sample, and the window (with its ONE port subscription) kept
 * across a full unsubscribe until `lifetime` aborts, the RxJS core's
 * `windowedSamples`. `source` is the port method's result, so the method is
 * called once, at construction. */
export function createMetricWindowPresenter(
  source: Stream<MetricSample>,
  lifetime: AbortSignal,
): MetricWindowPresenter {
  const windows = foldTopic<MetricSample, readonly MetricSample[]>(
    topicFromObservable(source),
    [],
    appendMetricSample,
    lifetime,
  );

  return { samples$: topicToStream(windows) };
}

/** The service topology — a warm mirror: silent until the port emits, then
 * the latest topology retained until `lifetime` aborts (`warmReplay()`). */
export function createTopologyPresenter(
  serviceHealth: ServiceHealthPort,
  lifetime: AbortSignal,
): ServiceTopologyPresenter {
  return {
    topology$: topicToStream(
      topicFromObservable(serviceHealth.topology$(), lifetime),
    ),
  };
}

/** The live session roster — the same warm-mirror shape as `topology`. */
export function createSessionsPresenter(
  sessions: SessionsPort,
  lifetime: AbortSignal,
): SessionsPresenter {
  return {
    sessions$: topicToStream(topicFromObservable(sessions.sessions$(), lifetime)),
  };
}

/** The rolling event log, newest first, capped at `MAX_LOG_ROWS` — a warm
 * fold like the metric windows. */
export function createEventLogPresenter(
  eventLog: EventLogPort,
  lifetime: AbortSignal,
): EventLogPresenter {
  const log = foldTopic<LogEvent, readonly LogEvent[]>(
    topicFromObservable(eventLog.events$()),
    [],
    prependLogEvent,
    lifetime,
  );

  return { events$: topicToStream(log) };
}

/** The session count as a rolling KPI window: each roster becomes a sample
 * `{ t: now(), value: roster.length }`, timestamped at emission, folded like
 * the metric windows. `now` is injectable for the unit tests; the contract
 * drives it through the fake system clock. */
export function createSessionsKpiPresenter(
  sessions: SessionsPort,
  lifetime: AbortSignal,
  now: () => number = Date.now,
): SessionsKpiPresenter {
  const series = foldTopic<readonly SessionInfo[], readonly MetricSample[]>(
    topicFromObservable(sessions.sessions$()),
    [],
    (window, roster) => {
      return appendMetricSample(window, { t: now(), value: roster.length });
    },
    lifetime,
  );

  return { countSeries$: topicToStream(series) };
}
