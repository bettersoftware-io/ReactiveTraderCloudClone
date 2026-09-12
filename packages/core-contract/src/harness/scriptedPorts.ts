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

  const connectionEvents: ConnectionEventsPort = {
    events: (): Observable<ConnectionEvent> => {
      return merge(base.connectionEvents.events(), connection$);
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
        return connectionEvents.events();
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
