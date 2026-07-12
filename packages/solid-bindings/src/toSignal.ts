import type { StateObservable } from "@rx-state/core";
import { type Accessor, createSignal, onCleanup } from "solid-js";

/** StateObservable → Solid signal. Subscribes eagerly: a warm or defaulted
 * StateObservable emits synchronously inside subscribe(), so the signal is
 * seeded with the real current value before this function returns — no
 * undefined first frame (the react-rxjs bind() warm-value trap, see
 * react-bindings createViewModel.ts:539-567, is impossible by construction).
 * `equals: false`-free: default === equality is correct, presenters emit
 * fresh references. Values are written via `setValue(() => v)` because Solid
 * treats function arguments to a setter as updaters. */
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
