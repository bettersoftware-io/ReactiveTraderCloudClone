import { Effect, Exit, ManagedRuntime, Scope } from "effect";

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
import type { CurrencyPair, ExecuteTradeInput } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createCommands } from "#/commands";
import { buildAppLayer, nativePresentersEffect } from "#/layers";
import { createNotionalMachine } from "#/machines/notional";
import { createRowHighlightMachine } from "#/machines/rowHighlight";
import { createStaleFlagMachine } from "#/machines/staleFlag";
import { createTileExecutionMachine } from "#/machines/tileExecution";
import { HostTag } from "#/services";

/** What `composeWithBase` hands back: the RxJS app it delegated to, the app
 * this core presents, and the Effect host the app owns — exposed so the
 * teardown guarantee is observable from a test rather than taken on trust.
 * `parity.test.ts` compares the two apps member by member. */
export interface ComposedApp {
  base: App;
  app: App;
  host: EffectHost;
}

/** The machine-factory twin of `ComposedApp`. */
export interface ComposedMachines {
  base: MachineFactories;
  machines: MachineFactories;
}

/** The app is a `ManagedRuntime` over the native Layer graph (`layers.ts`):
 * every native presenter is a service, `AppPorts` enters as
 * `Layer.succeed`, the host is a scoped Layer, and ONE `runSync` resolves
 * the `Presenters` overlay — slice 2's Tag/Layer composition (ADR-006).
 * Everything not in the graph still delegates to the RxJS core;
 * `parity.json` records which is which and `parity.test.ts` proves it. */
export function composeWithBase(ports: AppPorts): ComposedApp {
  const base = createRxjsApp(ports);
  const runtime = ManagedRuntime.make(buildAppLayer(ports));
  const { host, presenters } = runtime.runSync(
    Effect.all({ host: HostTag, presenters: nativePresentersEffect }),
  );

  const app: App = {
    ...base,
    presenters: { ...base.presenters, ...presenters },
    commands: createCommands(base.commands),
    // Order matters: the RxJS app goes first (its teardown may still drive
    // streams this core bridged), THEN the host scope interrupts whatever
    // fibers remain — every fold period and retained singleton is forked
    // from it — and only then is the runtime disposed, which closes the
    // Layer scope the host's is a child of (a no-op by then). Every step is
    // in a `finally` so one rejection cannot skip the rest; each is
    // idempotent, so calling `dispose()` twice is safe.
    dispose: async () => {
      try {
        await base.dispose();
      } finally {
        try {
          await Effect.runPromise(Scope.close(host.scope, Exit.void));
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

/** Native machine factories, closing over the SAME merged `presenters` the
 * RxJS builder gets. Each machine owns a detached host (slice 2 ruling 8). */
function nativeMachines(presenters: Presenters): Partial<MachineFactories> {
  return {
    tileExecution: (pair: CurrencyPair) => {
      return createTileExecutionMachine(pair, {
        execute: (input: ExecuteTradeInput) => {
          return presenters.execution.execute(input);
        },
      });
    },
    staleFlag: (pair: CurrencyPair) => {
      return createStaleFlagMachine({
        status$: presenters.connection.status$,
        value$: presenters.priceStream.price$(pair),
      });
    },
    analyticsStaleFlag: () => {
      return createStaleFlagMachine({
        status$: presenters.connection.status$,
        value$: presenters.analytics.position$,
      });
    },
    rowHighlight: (isNew: boolean) => {
      return createRowHighlightMachine(isNew);
    },
    notional: (defaultNotional: number) => {
      return createNotionalMachine(defaultNotional);
    },
  };
}

export function composeMachinesWithBase(
  presenters: Presenters,
): ComposedMachines {
  const base = createRxjsMachineFactories(presenters);
  return { base, machines: { ...base, ...nativeMachines(presenters) } };
}

export function createMachineFactories(
  presenters: Presenters,
): MachineFactories {
  return composeMachinesWithBase(presenters).machines;
}

export const effectCore: CoreFactory = { createApp, createMachineFactories };
