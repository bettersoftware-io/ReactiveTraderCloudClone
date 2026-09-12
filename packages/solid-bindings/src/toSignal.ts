import type { StateObservable } from "@rx-state/core";
import { type Accessor, createMemo, createSignal, onCleanup } from "solid-js";

/** A hook key that may be supplied either as a plain value (subscribe once,
 * at call time) or as an accessor (resubscribe whenever it changes). Solid
 * components run their setup body ONCE, so a value key freezes the
 * subscription at mount and its correctness then rests on the parent keying
 * the mount; an accessor key makes the read live at the seam instead.
 *
 * Narrowing by `typeof === "function"` is only safe because no key type the
 * ViewModel's pure-subscription hooks take is itself callable: `CurrencyPair`
 * is a plain object, the rest are `string` / `number` / the `CandleTimeframe`
 * string union. A callable key type would have to carry an explicit marker
 * instead. (Contrast `toSignal`'s own VALUES, which may legitimately be
 * functions — hence its `setValue(() => v)` wrapper.) */
export type MaybeAccessor<T> = T | Accessor<T>;

/** Current value of a `MaybeAccessor` key — the accessor form is CALLED, so
 * reading it inside a tracked scope (the `toKeyedSignal` memo below)
 * subscribes to it. */
export function readMaybeAccessor<T>(key: MaybeAccessor<T>): T {
  if (typeof key === "function") {
    return (key as Accessor<T>)();
  }

  return key;
}

/** Key-driven `toSignal`: `source` is re-run whenever any signal it reads
 * changes, and the subscription follows.
 *
 * Solid disposes a memo's own owner before re-running it, so the previous
 * `toSignal`'s `onCleanup` unsubscribes the old source on every key change,
 * and the new `toSignal` seeds synchronously from the new source — no
 * undefined frame between keys. When `source` reads no signal (a plain value
 * key) the memo tracks nothing and runs exactly once, which is
 * behaviour-identical to calling `toSignal` directly, one memo layer aside. */
export function toKeyedSignal<T>(
  source: () => StateObservable<T>,
): Accessor<T> {
  const inner = createMemo(() => {
    return toSignal(source());
  });

  return () => {
    return inner()();
  };
}

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
    // Release the eager subscription before propagating: the onCleanup
    // registration below is unreachable from this branch, so without this
    // the cold source's subscription would leak.
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
