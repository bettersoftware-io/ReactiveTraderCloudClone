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

import { createCommands } from "#/commands";
import { createNotionalMachine } from "#/machines/notional";
import { createRowHighlightMachine } from "#/machines/rowHighlight";
import { createStaleFlagMachine } from "#/machines/staleFlag";
import { createTileExecutionMachine } from "#/machines/tileExecution";
import { createBlotterPresenter } from "#/presenters/blotter";
import { createConnectionPresenter } from "#/presenters/connection";
import { createTradeExecutionPresenter } from "#/presenters/execution";
import {
  createJarvisPreferencesPresenter,
  createLoginWaitPreferencesPresenter,
} from "#/presenters/groupedPreferences";
import {
  createAmbientStylePresenter,
  createAnimatedBackgroundPresenter,
  createChartSubstratePresenter,
  createCreditRfqFilterPreferencePresenter,
  createEqBlotterViewPreferencePresenter,
  createForceBootAnimationPresenter,
  createLayoutEnginePresenter,
  createPowerSaverPresenter,
  createThemeSkinPreferencePresenter,
  createViewModePreferencePresenter,
} from "#/presenters/preferences";
import { createPriceHistoryPresenter } from "#/presenters/priceHistory";
import { createPriceStreamPresenter } from "#/presenters/priceStream";
import {
  createBootPreferencePresenter,
  createEqWatchlistSortPreferencePresenter,
} from "#/presenters/readPreferences";
import { createThemePreferencePresenter } from "#/presenters/themePreference";
import {
  createAnalyticsPresenter,
  createCurrencyPairsPresenter,
} from "#/presenters/warmSingletons";

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

/** Members this core implements natively — slice 1a: the connection fold,
 * the four theme/view/power-saver preferences, and `commands` (see
 * `createCommands`); slice 1b: the eleven remaining preference presenters;
 * slice 2: the six FX pricing/blotter/execution presenters, of which the
 * four warm singletons (`currencyPairs`, `blotter`'s `trades$`/`activity$`,
 * `analytics`) hold their port subscriptions until `lifetime` aborts.
 * Everything else still delegates to the RxJS core. `parity.json` is the
 * committed record of the same fact and `parity.test.ts` proves the two
 * agree by reference. */
function nativePresenters(
  ports: AppPorts,
  lifetime: AbortSignal,
): Partial<Presenters> {
  const { preferences } = ports;
  // Hoisted: `priceStream` and `priceHistory` gate their conflation on it —
  // the RxJS core's order.
  const powerSaver = createPowerSaverPresenter(preferences);
  return {
    connection: createConnectionPresenter(ports.connectionEvents),
    themePreference: createThemePreferencePresenter(
      preferences,
      ports.colorScheme,
    ),
    themeSkinPreference: createThemeSkinPreferencePresenter(preferences),
    viewModePreference: createViewModePreferencePresenter(preferences),
    powerSaver,
    creditRfqFilterPreference:
      createCreditRfqFilterPreferencePresenter(preferences),
    eqWatchlistSortPreference:
      createEqWatchlistSortPreferencePresenter(preferences),
    eqBlotterViewPreference:
      createEqBlotterViewPreferencePresenter(preferences),
    bootPreference: createBootPreferencePresenter(preferences),
    loginWaitPreferences: createLoginWaitPreferencesPresenter(preferences),
    jarvisPreferences: createJarvisPreferencesPresenter(preferences),
    animatedBackground: createAnimatedBackgroundPresenter(preferences),
    ambientStyle: createAmbientStylePresenter(preferences),
    chartSubstrate: createChartSubstratePresenter(preferences),
    layoutEngine: createLayoutEnginePresenter(preferences),
    forceBootAnimation: createForceBootAnimationPresenter(preferences),
    priceStream: createPriceStreamPresenter(ports.pricing, powerSaver.isCalm$),
    priceHistory: createPriceHistoryPresenter(
      ports.pricing,
      powerSaver.isCalm$,
    ),
    currencyPairs: createCurrencyPairsPresenter(ports.referenceData, lifetime),
    blotter: createBlotterPresenter(ports.blotter, lifetime),
    analytics: createAnalyticsPresenter(ports.analytics, lifetime),
    execution: createTradeExecutionPresenter(ports.execution),
  };
}

export function composeWithBase(ports: AppPorts): ComposedApp {
  const base = createRxjsApp(ports);
  const lifetime = new AbortController();
  const app: App = {
    ...base,
    presenters: {
      ...base.presenters,
      ...nativePresenters(ports, lifetime.signal),
    },
    commands: createCommands(base.commands),
    // The retained singletons hold port subscriptions for the app's life:
    // abort them FIRST — their relays may still be draining streams the
    // base app owns — then dispose the base. Idempotent: a second abort is
    // a no-op, and the base's dispose is its own concern.
    dispose: async () => {
      lifetime.abort();
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
 * identical to it, so `parity.test.ts` can tell native from delegated.
 *
 * The native factories close over the SAME merged `presenters` the RxJS
 * builder gets — `staleFlag` reads `priceStream.price$(pair)` and
 * `analyticsStaleFlag` reads `analytics.position$`, both native above;
 * `tileExecution` reaches `execution.execute`. */
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

/** Survives minification as a literal; `check:core-bundle` greps for it to
 * prove a build that did not select this core did not ship it. */
export const ASYNC_CORE_BRAND = "@rtc/client-core-async:brand";

/** A `CoreFactory` that also carries the grep-able brand literal above, so
 * `check:core-bundle` has something to look for. */
export interface BrandedCoreFactory extends CoreFactory {
  readonly brand: string;
}

export const asyncCore: BrandedCoreFactory = {
  brand: ASYNC_CORE_BRAND,
  createApp,
  createMachineFactories,
};
