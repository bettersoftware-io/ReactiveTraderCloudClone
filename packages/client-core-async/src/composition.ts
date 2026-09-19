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

import { createCommands } from "#/commands";
import { createConnectionPresenter } from "#/presenters/connection";
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
import {
  createBootPreferencePresenter,
  createEqWatchlistSortPreferencePresenter,
} from "#/presenters/readPreferences";
import { createThemePreferencePresenter } from "#/presenters/themePreference";

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
 * `createCommands`); slice 1b: the eleven remaining preference presenters.
 * Everything else still delegates to the RxJS core. `parity.json` is the
 * committed record of the same fact and `parity.test.ts` proves the two
 * agree by reference. */
function nativePresenters(ports: AppPorts): Partial<Presenters> {
  const { preferences } = ports;
  return {
    connection: createConnectionPresenter(ports.connectionEvents),
    themePreference: createThemePreferencePresenter(
      preferences,
      ports.colorScheme,
    ),
    themeSkinPreference: createThemeSkinPreferencePresenter(preferences),
    viewModePreference: createViewModePreferencePresenter(preferences),
    powerSaver: createPowerSaverPresenter(preferences),
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
  };
}

/** The strangler builds a full RxJS `base` — needed both to delegate every
 * member `nativePresenters` does not cover and for `parity.test.ts`'s
 * reference-inequality check — alongside the native presenters that shadow
 * it. A port method a native member ALSO reads at construction (the four
 * `portDiscipline` witnesses: `connectionEvents.events`, `themeMode$`,
 * `bootVariant$`, `eqWatchlistSort$`) would otherwise be called twice: once
 * building `base`'s now-discarded presenter for that member, once building
 * the native one. Read once, here, and shared with both. */
function sharePortReads(ports: AppPorts): AppPorts {
  const connectionEventsSource = ports.connectionEvents.events();
  const themeModeSource = ports.preferences.themeMode$();
  const bootVariantSource = ports.preferences.bootVariant$();
  const eqWatchlistSortSource = ports.preferences.eqWatchlistSort$();

  return {
    ...ports,
    connectionEvents: {
      events: () => {
        return connectionEventsSource;
      },
    },
    preferences: withCapturedReads(ports.preferences, {
      themeMode$: themeModeSource,
      bootVariant$: bootVariantSource,
      eqWatchlistSort$: eqWatchlistSortSource,
    }),
  };
}

/** Every other property of `port` passes through untouched — including
 * prototype methods a spread would drop, since a concrete port is typically
 * a class instance (`PreferencesSimulator`, `LocalStoragePreferencesAdapter`)
 * whose methods live on its prototype, not as the instance's own properties. */
function withCapturedReads<P extends object>(
  port: P,
  captured: Readonly<Partial<Record<keyof P, unknown>>>,
): P {
  return new Proxy(port, {
    get: (target: P, property: string | symbol, receiver: unknown): unknown => {
      if (typeof property === "string" && property in captured) {
        const value = captured[property as keyof P];

        return (): unknown => {
          return value;
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

export function composeWithBase(rawPorts: AppPorts): ComposedApp {
  const ports = sharePortReads(rawPorts);
  const base = createRxjsApp(ports);
  const app: App = {
    ...base,
    presenters: { ...base.presenters, ...nativePresenters(ports) },
    commands: createCommands(),
    // Every native member so far is a refCounted Topic: it holds nothing
    // between subscribers, so there is nothing app-scoped to abort. A member
    // that spawns an app-lifetime loop (slice 2's conflation is the first
    // candidate) must take an `AbortSignal` minted here and aborted below,
    // BEFORE the base app is disposed — its loops may still be draining
    // streams the base owns.
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
