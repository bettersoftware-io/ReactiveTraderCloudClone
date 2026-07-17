import type { Observable } from "rxjs";

import type { DevtoolsHub } from "../DevtoolsHub";
import type { PresenterManifest } from "../protocol";
import type { InstrumentableMachine } from "./machines";

interface ObservableLike {
  subscribe?: unknown;
}

function isObservable(x: unknown): x is Observable<unknown> {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as ObservableLike).subscribe === "function"
  );
}

function argsKey(args: readonly unknown[]): string {
  try {
    return JSON.stringify(args);
  } catch {
    return String(args.length);
  }
}

/** Returns a shallow copy of the presenters object where each manifest-listed
 * entry is replaced by a Proxy that (a) registers `props` observables once,
 * (b) wraps `methods` so each distinct arg tuple registers a child stream on
 * first call, (c) for `machine` entries registers state$ and logs intents.
 * Proxies (not spreads): presenters are class instances — spreading would drop
 * prototype methods. Method calls delegate with the ORIGINAL instance as
 * `this`. Any instrumentation failure falls back to the raw member. */
export function instrumentPresenters<T extends object>(
  presenters: T,
  manifest: PresenterManifest,
  hub: DevtoolsHub,
): T {
  const out: Record<string, unknown> = {
    ...(presenters as Record<string, unknown>),
  };

  for (const [key, entry] of Object.entries(manifest)) {
    const target = (presenters as Record<string, unknown>)[key];

    if (typeof target !== "object" || target === null) {
      continue;
    }

    if (entry.machine) {
      out[key] = instrumentSharedMachine(
        key,
        target as InstrumentableMachine,
        hub,
      );
      continue;
    }

    for (const prop of entry.props ?? []) {
      const source = (target as Record<string, unknown>)[prop];

      try {
        if (isObservable(source)) {
          hub.registerStream(`${key}.${prop}`, source);
        }
      } catch (error) {
        hub.reportError("instrumentPresenters:prop", error);
      }
    }

    const methods = entry.methods ?? [];

    if (methods.length === 0) {
      continue;
    }

    const registered = new Set<string>();
    const methodSet = new Set<string>(methods);
    out[key] = new Proxy(target, {
      get(t: object, p: string | symbol, receiver: unknown): unknown {
        if (typeof p === "string" && methodSet.has(p)) {
          const original = Reflect.get(t, p, t) as (
            ...a: readonly unknown[]
          ) => unknown;

          return (...args: readonly unknown[]) => {
            const result = Reflect.apply(original, t, args as unknown[]);

            try {
              const id = `${key}.${p}[${argsKey(args)}]`;

              if (isObservable(result) && !registered.has(id)) {
                registered.add(id);
                hub.registerStream(id, result);
              }
            } catch {
              // observation is best-effort; the caller gets `result` regardless
            }

            return result;
          };
        }

        return Reflect.get(t, p, receiver);
      },
    });
  }

  return out as T;
}

function instrumentSharedMachine(
  key: string,
  machine: InstrumentableMachine,
  hub: DevtoolsHub,
): InstrumentableMachine {
  let machineId = "";
  const intents: Record<string, unknown> = {};

  try {
    machineId = hub.machineCreated(key, [], machine.state$, intents);
  } catch {
    return machine;
  }

  try {
    for (const [name, fn] of Object.entries(machine.intents)) {
      intents[name] =
        typeof fn === "function"
          ? (...args: unknown[]): unknown => {
              try {
                hub.machineIntent(machineId, name, args);
              } catch {
                // never block the real intent
              }

              return (fn as (...a: unknown[]) => unknown)(...args);
            }
          : fn;
    }

    return { state$: machine.state$, intents, dispose: machine.dispose };
  } catch {
    // machine.intents was nullish/non-iterable (misconfigured manifest entry)
    // — hand back the raw machine rather than throwing into the app.
    return machine;
  }
}
