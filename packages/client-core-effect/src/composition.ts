import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";

import {
  createApp as createRxjsApp,
  createMachineFactories as createRxjsMachineFactories,
} from "@rtc/client-core";
import type {
  App,
  AppPorts,
  CoreFactory,
  MachineFactories,
  Presenters,
} from "@rtc/core-api";

import type { EffectHost } from "#/bridge/out";

/** What `composeWithBase` hands back: the RxJS app it delegated to, and the
 * app this core presents. `parity.test.ts` compares the two member by
 * member. */
export interface ComposedApp {
  base: App;
  app: App;
  /** The Effect side the app owns — what a native presenter runs under, and
   * what `app.dispose()` tears down. Exposed so the teardown guarantee is
   * observable from a test rather than taken on trust. */
  host: EffectHost;
}

/** The machine-factory twin of `ComposedApp`. */
export interface ComposedMachines {
  base: MachineFactories;
  machines: MachineFactories;
}

/** Members this core implements natively. Empty in slice 0: every member
 * delegates to the RxJS core. `parity.json` is the committed record of the
 * same fact and `parity.test.ts` proves the two agree by reference. The
 * runtime is threaded in because a native presenter will need one to run its
 * Effects under — it is unused while the overlay is empty. */
function nativePresenters(
  _base: Presenters,
  _host: EffectHost,
): Partial<Presenters> {
  return {};
}

export function composeWithBase(ports: AppPorts): ComposedApp {
  const base = createRxjsApp(ports);
  // The app owns a ManagedRuntime from day one, so `dispose()` has a real
  // Effect-side resource to close even before any member goes native — and a
  // Scope, because `ManagedRuntime.runFork` mints ROOT fibers that disposing
  // the runtime would NOT interrupt. Closing the scope is what ends them.
  const runtime = ManagedRuntime.make(Layer.empty);
  const scope = Effect.runSync(Scope.make());
  const host: EffectHost = { runtime, scope };
  const app: App = {
    ...base,
    presenters: {
      ...base.presenters,
      ...nativePresenters(base.presenters, host),
    },
    // Order matters: the RxJS app goes first (its teardown may still drive
    // streams this core bridged), THEN the scope interrupts whatever fibers
    // remain, and only then is the runtime disposed — disposing it earlier
    // would replace its effect with a defect, so the scope's own finalizers
    // would have nothing sound to run under. Every step is in a `finally` so
    // one rejection cannot skip the rest, and each step is idempotent, so
    // calling `dispose()` twice is safe.
    dispose: async () => {
      try {
        await base.dispose();
      } finally {
        try {
          // The global runtime, not the managed one: this must still work if
          // the managed runtime has already been disposed.
          await Effect.runPromise(Scope.close(scope, Exit.void));
        } finally {
          await runtime.dispose();
        }
      }
    },
  };
  return { base, app, host };
}

export function createApp(ports: AppPorts): App {
  return composeWithBase(ports).app;
}

/** The machine half of the same fact, and the same overlay seam. It has to
 * be an overlay rather than a bare `return createRxjsMachineFactories(...)`:
 * that builder mints fresh closures on every call, so two calls of it share
 * no identity at all and the manifest's `delegated` claim would be
 * unfalsifiable. Spreading ONE base keeps the delegated members reference-
 * identical to it, so `parity.test.ts` can tell native from delegated. */
function nativeMachines(_base: MachineFactories): Partial<MachineFactories> {
  return {};
}

export function composeMachinesWithBase(
  presenters: Presenters,
): ComposedMachines {
  const base = createRxjsMachineFactories(presenters);
  return { base, machines: { ...base, ...nativeMachines(base) } };
}

export function createMachineFactories(
  presenters: Presenters,
): MachineFactories {
  return composeMachinesWithBase(presenters).machines;
}

export const effectCore: CoreFactory = { createApp, createMachineFactories };
