import type { Observable } from "rxjs";

import type { DevtoolsHub } from "../DevtoolsHub";

/** Structural mirror of client-core's Machine<S,I> — devtools-core never
 * imports @rtc/client-core; matching by shape is the whole point. */
export interface InstrumentableMachine {
  state$: Observable<unknown>;
  intents: object;
  dispose: () => void;
}

type AnyMachineFactory = (...args: never[]) => InstrumentableMachine;

/** Wraps every factory so each machine instance reports created / state /
 * intents / disposed to the hub. One generic wrapper covers every current and
 * future factory. Instrumentation failures never block the wrapped call.
 *
 * Constrained to `object` (not `Record<string, AnyMachineFactory>`) so a
 * factory bag typed as a named interface — e.g. client-core's
 * `MachineFactories`, which has no index signature — satisfies it, mirroring
 * `instrumentPresenters`'s `<T extends object>`. The values are read
 * structurally at runtime regardless. */
export function instrumentMachineFactories<F extends object>(
  factories: F,
  hub: DevtoolsHub,
): F {
  const wrapped: Record<string, AnyMachineFactory> = {};

  for (const [kind, factory] of Object.entries(factories)) {
    wrapped[kind] = (...args: never[]): InstrumentableMachine => {
      const machine = factory(...args);
      let machineId = "";
      const intents: Record<string, unknown> = {};

      try {
        machineId = hub.machineCreated(kind, args, machine.state$, intents);
      } catch {
        return machine; // devtools failed — hand back the raw machine
      }

      try {
        for (const [name, fn] of Object.entries(machine.intents)) {
          if (typeof fn !== "function") {
            intents[name] = fn;
            continue;
          }

          intents[name] = (...intentArgs: unknown[]): unknown => {
            try {
              hub.machineIntent(machineId, name, intentArgs);
            } catch {
              // never block the real intent
            }

            return fn(...intentArgs);
          };
        }

        return {
          state$: machine.state$,
          intents,
          dispose: () => {
            try {
              hub.machineDisposed(machineId);
            } catch {
              // never block disposal
            }

            machine.dispose();
          },
        };
      } catch {
        // machine.intents was nullish/non-iterable (misconfigured factory
        // result) — hand back the raw machine rather than throwing into the
        // app's composition root.
        return machine;
      }
    };
  }

  return wrapped as F;
}
