import { type Accessor, onCleanup } from "solid-js";

import type { Machine } from "@rtc/client-core";

import { toSignal } from "#/toSignal";

type MachineView<TState, TIntents> = { state: Accessor<TState> } & TIntents;

/** Per-component machine bridge. Solid components run once, so the factory
 * runs once by construction — no lazy ref. Disposal is EAGER onCleanup:
 * Solid has no StrictMode double-mount, so react-bindings' microtask-deferred
 * dispose must NOT be copied here (deferring would be a bug, not a safety
 * net). The machine's own state$ is read directly (it is already warm). */
export function useMachine<TState, TIntents extends object & { state?: never }>(
  factory: () => Machine<TState, TIntents>,
): MachineView<TState, TIntents> {
  const machine = factory();
  onCleanup(() => {
    machine.dispose();
  });
  return { state: toSignal(machine.state$), ...machine.intents };
}
