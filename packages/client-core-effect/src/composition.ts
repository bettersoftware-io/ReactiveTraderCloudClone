import { Effect, Exit, ManagedRuntime, Scope } from "effect";

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
import { gateTransportOnAuth } from "#/bridge/transportGate";
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

/** What `composeApp` hands back: the app, and the Effect host it owns —
 * exposed so the teardown guarantee is observable from a test rather than
 * taken on trust. */
export interface ComposedApp {
  app: App;
  host: EffectHost;
}

/** The app is a `ManagedRuntime` over the native Layer graph (`layers.ts`):
 * every native presenter is a service, `AppPorts` enters as
 * `Layer.succeed`, the host is a scoped Layer, and ONE `runSync` resolves
 * the native presenters (slice 2's Tag/Layer composition, ADR-006). The
 * Jarvis family and its workspace are built on child hosts of this app's
 * host (slice 7 wave 2): jarvis first, the workspace over its own events,
 * then the driver, demo, narrator, history source and usage. `App.presenters:
 * Presenters` makes the typecheck the completeness witness — every member
 * is this core's. The transport is gated on this core's own `auth`. */
export function composeApp(ports: AppPorts): ComposedApp {
  const runtime = ManagedRuntime.make(buildAppLayer(ports));
  const { host, presenters } = runtime.runSync(
    Effect.all({ host: HostTag, presenters: nativePresentersEffect }),
  );

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
  gateTransportOnAuth(host, ports.transport, presenters.auth.state$);

  const app: App = {
    ports,
    presenters: {
      ...presenters,
      ...family.workspace.presenters,
      jarvis: family.jarvis,
      jarvisDriver: family.jarvisDriver,
      jarvisDemo: family.jarvisDemo,
      jarvisUsage: family.jarvisUsage,
    },
    commands: createCommands(
      ports.connectionIntents,
      family.workspace.reportDetachedPanels,
    ),
    // The host scope first — it interrupts every fiber still running (each
    // fold period, retained singleton and the Jarvis family's child hosts
    // are forked from it) — then the runtime, closing the Layer scope the
    // host's is a child of (a no-op by then). The runtime dispose sits in a
    // `finally` so a failed scope close cannot skip it; both are idempotent,
    // so calling `dispose()` twice is safe.
    dispose: async () => {
      try {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
      } finally {
        await runtime.dispose();
      }
    },
  };
  return { app, host };
}

export function createApp(ports: AppPorts): App {
  return composeApp(ports).app;
}

/** This core's machine factories, closing over the `presenters` they are
 * given. Each machine owns a detached host (slice 2 ruling 8). */
function nativeMachines(presenters: Presenters): MachineFactories {
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

export function createMachineFactories(
  presenters: Presenters,
): MachineFactories {
  return nativeMachines(presenters);
}

export const effectCore: CoreFactory = { createApp, createMachineFactories };
