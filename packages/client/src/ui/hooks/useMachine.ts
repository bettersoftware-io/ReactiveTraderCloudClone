import { useEffect, useRef } from "react";
import { useStateObservable } from "@react-rxjs/core";
import type { Machine } from "../../app/presenters/machine";

/** Logic-free bridge: instantiates the factory once per mount (lazy useRef so
 * StrictMode double-render can't double-instantiate), reads state$ via
 * useStateObservable, returns { state, ...intents } (stable intent refs), and
 * disposes on unmount. The only UI primitive allowed to import react-rxjs;
 * components never import it (createAppHooks does). */
export function useMachine<TState, TIntents extends object & { state?: never }>(
  factory: () => Machine<TState, TIntents>,
): { state: TState } & TIntents {
  const ref = useRef<Machine<TState, TIntents> | null>(null);
  if (ref.current === null) ref.current = factory();
  const machine = ref.current;
  useEffect(() => () => machine.dispose(), [machine]);
  const state = useStateObservable(machine.state$);
  return { state, ...machine.intents };
}
