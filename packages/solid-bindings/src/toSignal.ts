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

/** Key-driven `toSignal`: the subscription follows the key's VALUE.
 *
 * Each key is resolved through its OWN `createMemo` — default `===` equality —
 * BEFORE it reaches `source`, and `source` receives the resolved values rather
 * than reading anything itself. That gate is the whole point of taking the
 * keys instead of an opaque thunk: a key accessor is very often a getter over
 * a much coarser signal (`() => props.symbol`, where `props.symbol` reads the
 * whole eqWorkspace `state()` object), so a thunk-shaped helper would re-run —
 * and therefore tear the subscription down to refcount 0 and rebuild it — on
 * every unrelated update to that object. For `CandleSeriesPresenter` that
 * discards every backfilled page and re-generates the series; the earlier,
 * thunk-shaped version of this helper did exactly that on any chart-type,
 * indicator or y-scale toggle. `source` must therefore stay signal-free: read
 * keys only through the arguments it is handed.
 *
 * Object keys compare by REFERENCE under `===`, which is the right semantic
 * here: `CurrencyPair` is static per-symbol metadata and `LiveRatesPanel`
 * already keys its `<For>` on that same reference.
 *
 * On a real key change Solid disposes the memo's own owner before re-running
 * it, so the previous `toSignal`'s `onCleanup` unsubscribes the old source
 * first and the new `toSignal` seeds synchronously from the new one — no
 * undefined frame between keys. A plain value key reads no signal, so its memo
 * runs exactly once and the subscription is created once, behaviour-identical
 * to calling `toSignal` directly. */
export function toKeyedSignal<K, T>(
  key: MaybeAccessor<K>,
  source: (key: K) => StateObservable<T>,
): Accessor<T>;
export function toKeyedSignal<K1, K2, T>(
  key1: MaybeAccessor<K1>,
  key2: MaybeAccessor<K2>,
  source: (key1: K1, key2: K2) => StateObservable<T>,
): Accessor<T>;

export function toKeyedSignal<T>(...args: readonly unknown[]): Accessor<T> {
  const source = args[args.length - 1] as (
    ...keys: readonly unknown[]
  ) => StateObservable<T>;

  // One `===`-gated memo PER key, so a two-key hook re-subscribes once when
  // its symbol changes and once when its timeframe does — never because some
  // unrelated field of the object they were read from was replaced.
  const resolved = args.slice(0, -1).map((key) => {
    return createMemo(() => {
      return readMaybeAccessor(key as MaybeAccessor<unknown>);
    });
  });

  const inner = createMemo(() => {
    return toSignal(
      source(
        ...resolved.map((readKey) => {
          return readKey();
        }),
      ),
    );
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
