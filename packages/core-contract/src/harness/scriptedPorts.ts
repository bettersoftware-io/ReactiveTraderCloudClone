import { BehaviorSubject, merge, type Observable, Subject } from "rxjs";

import type { AppPorts, ColorSchemeSource, Stream } from "@rtc/core-api";
import type { ConnectionEvent, ConnectionEventsPort } from "@rtc/domain";

export interface ScriptedDriver {
  /** Push one connection event into the stream the core observes. */
  emitConnection(event: ConnectionEvent): void;
  /** The merged connection-event stream the core sees — includes whatever
   * the runner's base port carries (e.g. the RxJS core's `reconnect$`). */
  connectionEvents$(): Stream<ConnectionEvent>;
  /** Flip the OS colour scheme the theme presenter resolves "system" against. */
  setPrefersDark(on: boolean): void;
}

export interface ScriptedPorts {
  ports: AppPorts;
  driver: ScriptedDriver;
  teardown(): void;
}

/** Wrap a runner-supplied `AppPorts` so the suites can drive connection
 * events and the colour scheme deterministically. Everything else in
 * `base` is passed through untouched — the runner decides what backs it
 * (domain simulators, in-memory stores). */
export function scriptPorts(base: AppPorts): ScriptedPorts {
  const connection$ = new Subject<ConnectionEvent>();
  const prefersDark$ = new BehaviorSubject<boolean>(false);

  // Built ONCE, and handed to both the core (through `connectionEvents`) and
  // the suites (through `driver.connectionEvents$()`), so the two can never
  // observe different merge instances. Rebuilding it per call would be
  // observationally equivalent only while every runner's base port is hot
  // (client-core's `reconnect$` is a bare Subject); against a base port that
  // returns a cold per-subscribe stream, the reconnect suite would go green
  // on a stream the core never saw. The consequence — `base.connectionEvents
  // .events()` is called once here rather than once per subscription — is the
  // intended semantics: one shared stream.
  const events$ = merge(base.connectionEvents.events(), connection$);

  const connectionEvents: ConnectionEventsPort = {
    events: (): Observable<ConnectionEvent> => {
      return events$;
    },
  };

  const colorScheme: ColorSchemeSource = {
    prefersDark$: (): Observable<boolean> => {
      return prefersDark$;
    },
  };

  return {
    ports: { ...base, connectionEvents, colorScheme },
    driver: {
      emitConnection: (event: ConnectionEvent) => {
        connection$.next(event);
      },
      connectionEvents$: () => {
        return events$;
      },
      setPrefersDark: (on: boolean) => {
        prefersDark$.next(on);
      },
    },
    teardown: () => {
      connection$.complete();
      prefersDark$.complete();
    },
  };
}
