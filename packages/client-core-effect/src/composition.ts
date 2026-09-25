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
  RfqCountdownSeed,
  WorkspaceTab,
} from "@rtc/core-api";
import type {
  BootVariant,
  CurrencyPair,
  ExecuteTradeInput,
  PlaceOrderRequest,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createCommands } from "#/commands";
import { buildAppLayer, nativePresentersEffect } from "#/layers";
import { createBootMachine } from "#/machines/boot";
import { createNotionalMachine } from "#/machines/notional";
import { createOrderTicketMachine } from "#/machines/orderTicket";
import { createRfqCountdownMachine } from "#/machines/rfqCountdown";
import { createRfqTileMachine } from "#/machines/rfqTile";
import { createRowHighlightMachine } from "#/machines/rowHighlight";
import { createStaleFlagMachine } from "#/machines/staleFlag";
import { createTileExecutionMachine } from "#/machines/tileExecution";
import { createJarvisFamily } from "#/presenters/jarvisFamily";
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
  const runtime = ManagedRuntime.make(buildAppLayer(ports));
  const { host, presenters } = runtime.runSync(
    Effect.all({ host: HostTag, presenters: nativePresentersEffect }),
  );

  // Native FIRST (see `CoreSeams`): the base app's remaining internal
  // readers — its animation director and workspace seed — are pointed at
  // this core's own members, and its whole Jarvis family (driver, demo,
  // narrator, history source, workspace) stands down (`nativeJarvis`).
  // Without that a fill or an FX execution made through a NATIVE presenter
  // would choreograph nothing, and each port those readers share with a
  // native member would be held twice.
  //
  // The Jarvis family and its workspace, end to end on child hosts of this
  // app's host (slice 7 wave 2): jarvis first, the workspace over its own
  // events, then the driver, demo, narrator, history source and usage.
  const family = createJarvisFamily(host, {
    ports,
    workspaceNav: presenters.workspaceNav,
    eqWorkspace: presenters.eqWorkspace,
    watchlist$: presenters.watchlist.watchlist$,
    themeSkinPreference: presenters.themeSkinPreference,
    powerSaver: presenters.powerSaver,
    jarvisPreferences: presenters.jarvisPreferences,
    pairs$: presenters.currencyPairs.pairs$,
    priceFor: (pair: CurrencyPair) => {
      return presenters.priceStream.price$(pair);
    },
  });
  const base = createRxjsApp(ports, {
    eqWorkspace: presenters.eqWorkspace,
    equityFills$: presenters.ordersBlotter.fills$,
    watchlist$: presenters.watchlist.watchlist$,
    pairs$: presenters.currencyPairs.pairs$,
    priceFor: (pair: CurrencyPair) => {
      return presenters.priceStream.price$(pair);
    },
    executions$: presenters.execution.executions$,
    rfqEvents$: presenters.rfqs.events$,
    connectionStatus$: presenters.connection.status$,
    workspaceNav: presenters.workspaceNav,
    nativeJarvis: true,
  });

  const app: App = {
    ...base,
    presenters: {
      ...base.presenters,
      ...presenters,
      ...family.workspace.presenters,
      jarvis: family.jarvis,
      jarvisDriver: family.jarvisDriver,
      jarvisDemo: family.jarvisDemo,
      jarvisUsage: family.jarvisUsage,
    },
    commands: createCommands(family.workspace.reportDetachedPanels),
    // General rule (see docs/architecture/22-pluggable-application-core.md
    // §22 "Teardown order"): an alternative core releases its own resources
    // first, then the base app, then (for Effect) the runtime. THIS core's
    // order differs from that rule — `base.dispose()` runs first, then the
    // host scope interrupts whatever fibers remain (every fold period and
    // retained singleton is forked from it), and only then is the runtime
    // disposed, closing the Layer scope the host's is a child of (a no-op
    // by then). That reversed order is equally safe today because the RxJS
    // core's `dispose()` is a knowing no-op for the members this core has
    // ported natively, so it never races the host's own teardown; slice 8
    // removes the base delegation entirely, at which point this ordering
    // question disappears. Every step is in a `finally` so one rejection
    // cannot skip the rest; each is idempotent, so calling `dispose()`
    // twice is safe.
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
    rfqTile: (pair: CurrencyPair) => {
      return createRfqTileMachine(pair, {
        requestQuote: (symbol: string, pipsPosition: number) => {
          return presenters.rfqQuote.requestQuote(symbol, pipsPosition);
        },
      });
    },
    rfqSubmission: () => {
      return presenters.rfqs.createSubmission();
    },
    ticketSubmission: () => {
      return presenters.rfqs.createTicketSubmission();
    },
    rfqCountdown: (seed: RfqCountdownSeed) => {
      return createRfqCountdownMachine(seed);
    },
    boot: (onDone: () => void) => {
      return createBootMachine({
        variant: presenters.bootPreference.current(),
        advance: (next: BootVariant) => {
          presenters.bootPreference.setVariant(next);
        },
        onDone,
      });
    },
    layout: (tab: WorkspaceTab) => {
      return presenters.layoutFor(tab);
    },
    orderTicket: (defaultSymbol: string) => {
      return createOrderTicketMachine({
        place: (req: PlaceOrderRequest) => {
          return presenters.ordersBlotter.place(req);
        },
        defaultSymbol,
      });
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
