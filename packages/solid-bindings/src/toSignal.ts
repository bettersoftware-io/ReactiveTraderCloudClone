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
 * a fresh `toSignal`, one more subscribe and one more unsubscribe — on every
 * unrelated update to that object. Under Solid 1, which cleaned up before
 * re-running, that tore the subscription down to refcount 0 and rebuilt it:
 * for `CandleSeriesPresenter` it discarded every backfilled page, on any
 * chart-type, indicator or y-scale toggle (the earlier, thunk-shaped version
 * of this helper did exactly that). `source` must therefore stay signal-free: read
 * keys only through the arguments it is handed.
 *
 * Object keys compare by REFERENCE under `===`, which is the right semantic
 * here: `CurrencyPair` is static per-symbol metadata and `LiveRatesPanel`
 * already keys its `<For>` on that same reference.
 *
 * On a real key change Solid 2 runs the memo's new compute BEFORE it cleans up
 * the previous run: the new `toSignal` subscribes to the new key's source and
 * seeds synchronously from it, then the previous run's `onCleanup`
 * unsubscribes the old one — no undefined frame between keys, and a source
 * shared by both keys never drops to refcount 0 in between. A plain value key
 * reads no signal, so its memo runs exactly once and the subscription is
 * created once, behaviour-identical to calling `toSignal` directly. */
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

/** The box a bridged value travels in. Solid 2's `createSignal(fn)` is the
 * writable-DERIVED form (the function is a compute, not a value), so a
 * StateObservable whose values are themselves functions could not be seeded
 * unboxed; boxing every value keeps one code path for all `T`. */
interface Box<T> {
  readonly value: T;
}

/** Equality of two boxes is equality of what they carry, `===` — so a
 * re-emission of the same reference notifies nobody, as an unboxed signal's
 * default `equals` would. */
function sameBoxedValue<T>(a: Box<T>, b: Box<T>): boolean {
  return a.value === b.value;
}

/** StateObservable → Solid signal. Subscribes eagerly: a warm or defaulted
 * StateObservable emits synchronously inside subscribe(), so the signal is
 * seeded with the real current value before this function returns — no
 * undefined first frame (the react-rxjs bind() warm-value trap, see
 * react-bindings createViewModel.ts:539-567, is impossible by construction).
 *
 * Later emissions are WRITES, and Solid 2 applies writes per microtask: every
 * value the source emits in one synchronous turn lands in the same flush, so
 * the UI re-renders once per turn however many values a burst carried — the
 * UI-side half of the core's "a burst is delivered in one turn" guarantee
 * (§22 guarantee 5). The flip side is that a read straight after an emission
 * still returns the previous value until that flush (or an explicit
 * `flush()`, which is what tests call before asserting).
 *
 * The bridge signal keeps Solid 2's owned-scope write guard (no `ownedWrite`
 * opt-out): every emission the app produces arrives from an event handler,
 * an effect's apply phase, a timer or a port — never while Solid runs a
 * component body, memo or effect compute (measured 2026-11-22 over the unit,
 * contract and dev-server e2e suites on all three cores). An emission that
 * ever did arrive there would mean a subscription with side effects on other
 * streams, and the dev-mode throw is the right place to learn about it. A
 * write during disposal (an unsubscribe that emits) is exempt anyway. */
export function toSignal<T>(state$: StateObservable<T>): Accessor<T> {
  let seed = null as Box<T> | null;
  let write: ((v: T) => void) | null = null;
  const sub = state$.subscribe((v) => {
    if (write === null) {
      seed = { value: v };
    } else {
      write(v);
    }
  });

  if (seed === null) {
    // Release the eager subscription before propagating: the onCleanup
    // registration below is unreachable from this branch, so without this
    // the cold source's subscription would leak.
    sub.unsubscribe();

    throw new Error(
      "toSignal requires a warm or defaulted StateObservable (no synchronous emission received)",
    );
  }

  const [boxed, setBoxed] = createSignal<Box<T>>(seed, {
    equals: sameBoxedValue,
  });

  write = (v: T): void => {
    setBoxed({ value: v });
  };

  onCleanup(() => {
    sub.unsubscribe();
  });

  return () => {
    return boxed().value;
  };
}
