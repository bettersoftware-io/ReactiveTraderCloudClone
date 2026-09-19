import { BehaviorSubject, merge, type Observable, Subject } from "rxjs";

import type { AppPorts, ColorSchemeSource, Stream } from "@rtc/core-api";
import type {
  ConnectionEvent,
  ConnectionEventsPort,
  PreferencesPort,
} from "@rtc/domain";

/** A port method name the discipline suite can count — the `$`-suffixed
 * stream methods of `PreferencesPort`, plus `connectionEvents.events`. */
export type PortMethodName =
  | Extract<keyof PreferencesPort, `${string}$`>
  | "connectionEvents.events";

/** Wrap a port so every method call is counted by name. A Proxy rather than
 * a spread: a class port's methods live on its prototype, which a spread
 * drops. Counting happens on `get` of a function-valued property, which is
 * where a call begins; property reads that are not calls (none, on a port)
 * would over-count — acceptable for a discipline witness. */
function countCalls<P extends object>(
  port: P,
  counts: Map<string, number>,
  prefix = "",
): P {
  return new Proxy(port, {
    get: (target: P, property: string | symbol, receiver: unknown) => {
      const value = Reflect.get(target, property, receiver);

      if (typeof value === "function" && typeof property === "string") {
        return (...args: unknown[]) => {
          const key = `${prefix}${property}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          return Reflect.apply(value, target, args);
        };
      }

      return value;
    },
  });
}

export interface ScriptedDriver {
  /** Push one connection event into the stream the core observes. */
  emitConnection(event: ConnectionEvent): void;
  /** Error the connection-event stream the core observes — a real source
   * failure, not a domain event, so it reaches `Collected.errors` rather
   * than folding into a status value. Terminal, like the Subject it drives:
   * a later `emitConnection`/`failConnection` is a no-op after this. */
  failConnection(error: unknown): void;
  /** The merged connection-event stream the core sees — includes whatever
   * the runner's base port carries (e.g. the RxJS core's `reconnect$`). */
  connectionEvents$(): Stream<ConnectionEvent>;
  /** Flip the OS colour scheme the theme presenter resolves "system" against. */
  setPrefersDark(on: boolean): void;
  /** How many times the core has invoked this port method since the harness
   * was built — the "called once, at construction" discipline's witness. */
  portCalls(method: PortMethodName): number;
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
  const calls = new Map<string, number>();
  const preferences = countCalls(base.preferences, calls);

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
      calls.set(
        "connectionEvents.events",
        (calls.get("connectionEvents.events") ?? 0) + 1,
      );
      return events$;
    },
  };

  const colorScheme: ColorSchemeSource = {
    prefersDark$: (): Observable<boolean> => {
      return prefersDark$;
    },
  };

  return {
    ports: { ...base, preferences, connectionEvents, colorScheme },
    driver: {
      emitConnection: (event: ConnectionEvent) => {
        connection$.next(event);
      },
      failConnection: (error: unknown) => {
        connection$.error(error);
      },
      connectionEvents$: () => {
        return events$;
      },
      setPrefersDark: (on: boolean) => {
        prefersDark$.next(on);
      },
      portCalls: (method: PortMethodName) => {
        return calls.get(method) ?? 0;
      },
    },
    teardown: () => {
      connection$.complete();
      prefersDark$.complete();
    },
  };
}
