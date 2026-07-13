import type { StateObservable } from "@rx-state/core";
import { type Accessor, createSignal, onCleanup } from "solid-js";

/**
 * StateObservable → Solid signal. A LOCAL copy of `@rtc/solid-bindings`'s
 * internal `toSignal` (packages/solid-bindings/src/toSignal.ts): that
 * package's `exports` field publishes only `"."` (barrelled via
 * `src/index.ts`), and its barrel deliberately does NOT re-export
 * `toSignal` — it's an internal implementation detail of that package's own
 * `createViewModel`, not part of the public seam. A deep import
 * (`@rtc/solid-bindings/dist/toSignal`) isn't even resolvable under that
 * `exports` map, and reaching past a package's published surface to grab an
 * internal module would be a package-boundary violation either way — so this
 * harness carries its own copy instead. Semantics are identical: subscribes
 * eagerly, requires a warm/defaulted `StateObservable` (true for every World
 * subject here — a BehaviorSubject always emits synchronously on subscribe).
 */
export function toSignal<T>(state$: StateObservable<T>): Accessor<T> {
  let seed!: T;
  let seeded = false;
  let write: ((v: T) => void) | null = null;
  const sub = state$.subscribe((v) => {
    if (write === null) {
      seed = v;
      seeded = true;
    } else {
      write(v);
    }
  });

  if (!seeded) {
    sub.unsubscribe();

    throw new Error(
      "toSignal requires a warm or defaulted StateObservable (no synchronous emission received)",
    );
  }

  const [value, setValue] = createSignal<T>(seed);

  write = (v: T): void => {
    setValue(() => {
      return v;
    });
  };

  onCleanup(() => {
    sub.unsubscribe();
  });
  return value;
}
