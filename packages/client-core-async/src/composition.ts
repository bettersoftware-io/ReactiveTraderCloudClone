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
 * same fact and `parity.test.ts` proves the two agree by reference. */
function nativePresenters(_base: Presenters): Partial<Presenters> {
  return {};
}

export function composeWithBase(ports: AppPorts): ComposedApp {
  const base = createRxjsApp(ports);
  const app: App = {
    ...base,
    presenters: { ...base.presenters, ...nativePresenters(base.presenters) },
    dispose: async () => {
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

export const asyncCore: CoreFactory = { createApp, createMachineFactories };
