import { Layer, ManagedRuntime } from "effect";

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

/** What `composeWithBase` hands back: the RxJS app it delegated to, and the
 * app this core presents. `parity.test.ts` compares the two member by
 * member. */
export interface ComposedApp {
  base: App;
  app: App;
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
  _runtime: ManagedRuntime.ManagedRuntime<never, never>,
): Partial<Presenters> {
  return {};
}

export function composeWithBase(ports: AppPorts): ComposedApp {
  const base = createRxjsApp(ports);
  // The app owns a ManagedRuntime from day one, so `dispose()` has a real
  // Effect-side resource to close even before any member goes native.
  const runtime = ManagedRuntime.make(Layer.empty);
  const app: App = {
    ...base,
    presenters: {
      ...base.presenters,
      ...nativePresenters(base.presenters, runtime),
    },
    dispose: async () => {
      await runtime.dispose();
      await base.dispose();
    },
  };
  return { base, app };
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
