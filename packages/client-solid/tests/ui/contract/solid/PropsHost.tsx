import { state } from "@rx-state/core";
import type { BehaviorSubject } from "rxjs";
import type { Accessor, JSX } from "solid-js";
import { untrack } from "solid-js";

import { toSignal } from "@rtc/solid-bindings/toSignal";

interface PropsHostProps<P> {
  subject: BehaviorSubject<Partial<P>>;
  build: (props: Accessor<Partial<P>>) => JSX.Element;
}

/**
 * Signal-driven props wrapper — the Solid counterpart of the react driver's
 * PropsHost (which re-renders on every `subject` push via
 * `useSyncExternalStore`). Solid components run their setup body exactly
 * ONCE, so re-rendering-on-push isn't available here; instead `build`
 * receives the props ACCESSOR itself (not a resolved snapshot), and every
 * registry entry reads individual fields through it at their JSX use site
 * (e.g. `p().stale`) so Solid's compiler wraps each as a reactive getter —
 * exactly the pattern InhouseLayoutEngine.tsx's SOLID PORT NOTE documents for
 * `props.state` there.
 *
 * `subject` (a BehaviorSubject) is already warm — it always emits
 * synchronously on subscribe — so wrapping it through `@rx-state/core`'s
 * `state()` and `@rtc/solid-bindings/toSignal` reuses the exact same
 * "hot-observable → accessor" idiom `viewModelFromWorld.ts` uses (and that
 * `@rtc/solid-bindings`'s own `createViewModel` uses internally), rather
 * than hand-rolling a second subscribe/cleanup pair for this one host. */
export function PropsHost<P>(props: PropsHostProps<P>): JSX.Element {
  // One subscription, opened once from the subject this host mounted with —
  // its identity never changes, only its emissions do, and those stay live
  // through `value`. A deliberate snapshot, spelt `untrack`.
  const value = untrack((): Accessor<Partial<P>> => {
    return toSignal(state(props.subject, props.subject.getValue()));
  });

  // `build` constructs the tree once; what stays live is the accessor it
  // reads through at each JSX use site, never a re-invocation of build.
  return untrack((): JSX.Element => {
    return props.build(value);
  });
}
