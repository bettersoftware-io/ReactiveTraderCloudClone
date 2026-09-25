import type {
  AppPorts,
  EqWorkspaceIntents,
  EqWorkspaceState,
  JarvisDemoMachineHandle,
  JarvisDriverMachineHandle,
  JarvisMachineHandle,
  JarvisPreferencesPresenter,
  JarvisUsagePresenter,
  Machine,
  PowerSaverPresenter,
  Stream,
  ThemeSkinPreferencePresenter,
  WorkspaceNavIntents,
  WorkspaceNavState,
  WorkspaceTab,
} from "@rtc/core-api";
import { LAYOUT_PANEL_IDS } from "@rtc/core-logic";
import type {
  CurrencyPair,
  EquityInstrument,
  JarvisSkin,
  PowerSaverLevel,
  Price,
  ThemeSkin,
} from "@rtc/domain";

import { peek, relay } from "#/bridge/in";
import { reportAsync } from "#/kernel/reportAsync";
import {
  createJarvisMachine,
  wireJarvisHistorySource,
} from "#/presenters/jarvis";
import { createJarvisDemo } from "#/presenters/jarvisDemo";
import { createJarvisDriver } from "#/presenters/jarvisDriver";
import { createJarvisUsagePresenter } from "#/presenters/jarvisUsage";
import { createNarrator } from "#/presenters/narrator";
import {
  createNativeWorkspace,
  type NativeWorkspace,
} from "#/presenters/workspace";

/** The native members the Jarvis family reads. */
export interface JarvisFamilyDeps {
  readonly ports: AppPorts;
  readonly workspaceNav: Machine<WorkspaceNavState, WorkspaceNavIntents>;
  readonly eqWorkspace: Machine<EqWorkspaceState, EqWorkspaceIntents>;
  readonly watchlist$: Stream<readonly EquityInstrument[]>;
  readonly themeSkinPreference: ThemeSkinPreferencePresenter;
  readonly powerSaver: PowerSaverPresenter;
  readonly jarvisPreferences: JarvisPreferencesPresenter;
  readonly pairs$: Stream<readonly CurrencyPair[]>;
  readonly priceFor: (pair: CurrencyPair) => Stream<Price>;
}

export interface JarvisFamily {
  readonly jarvis: JarvisMachineHandle;
  readonly jarvisDriver: JarvisDriverMachineHandle;
  readonly jarvisDemo: JarvisDemoMachineHandle;
  readonly jarvisUsage: JarvisUsagePresenter;
  readonly workspace: NativeWorkspace;
}

/**
 * The Jarvis family and the workspace it drives, built by this core end to
 * end (pluggable-core slice 7 wave 2, ruling 10), in the RxJS composition's
 * order: `jarvis`, then the workspace over its OWN `events$` (the wave-1
 * factory seam is no longer needed), then the driver — whose outcomes fold
 * back into the transcript — the demo, the narrator, the history source and
 * the usage presenter. The base app stands down (`CoreSeams.nativeJarvis`).
 */
export function createJarvisFamily(
  deps: JarvisFamilyDeps,
  lifetime: AbortSignal,
): JarvisFamily {
  const { ports } = deps;
  const jarvis = createJarvisMachine(
    {
      port: ports.jarvis,
      skin$: ports.preferences.jarvisSkin$(),
      setSkin: (skin: JarvisSkin) => {
        ports.preferences.setJarvisSkin(skin);
      },
      availability$: ports.jarvis.availability$?.(),
      preferredBrain$: ports.preferences.jarvisBrain$(),
      effort$: ports.preferences.jarvisEffort$(),
    },
    lifetime,
  );

  const workspace = createNativeWorkspace(
    {
      ports,
      jarvisEvents$: jarvis.events$,
      workspaceNav: deps.workspaceNav,
    },
    lifetime,
  );

  function powerSaverLevelNow(): PowerSaverLevel {
    return peek<PowerSaverLevel>(deps.powerSaver.level$, "off");
  }

  const jarvisDriver = createJarvisDriver(
    {
      events$: jarvis.events$,
      powerSaverLevel: powerSaverLevelNow,
      commands: {
        ...workspace.drive,
        switchTab: (tab: WorkspaceTab) => {
          deps.workspaceNav.intents.switchTab(tab);
        },
        eqWorkspace: deps.eqWorkspace.intents,
        eqWorkspaceState: () => {
          return peekCurrentState(deps.eqWorkspace.state$);
        },
        setThemeSkin: (skin: ThemeSkin) => {
          deps.themeSkinPreference.setSkin(skin);
        },
        setPowerSaver: (level: PowerSaverLevel) => {
          deps.powerSaver.setLevel(level);
        },
        knownLayoutPanelIds: (tab: WorkspaceTab) => {
          return LAYOUT_PANEL_IDS[tab];
        },
        knownSymbols: () => {
          const list = peekCurrentState(deps.watchlist$);
          return list?.map((instrument) => {
            return instrument.symbol;
          });
        },
      },
    },
    lifetime,
  );
  void relay(jarvisDriver.outcomes$, lifetime, (outcome) => {
    jarvis.intents.recordDriveOutcome(outcome);
  }).catch(reportAsync);

  const jarvisDemo = createJarvisDemo(
    {
      jarvisState$: jarvis.state$,
      jarvisEvents$: jarvis.events$,
      jarvis: jarvis.intents,
      powerSaverLevel: powerSaverLevelNow,
    },
    lifetime,
  );
  createNarrator(
    {
      pairs$: deps.pairs$,
      priceFor: deps.priceFor,
      narrate: (prompt: string) => {
        jarvis.intents.narrate(prompt);
      },
      preference$: deps.jarvisPreferences.narrator$,
      config: ports.narratorConfig,
      now: () => {
        return Date.now();
      },
    },
    lifetime,
  );
  wireJarvisHistorySource(ports.jarvis, jarvis);

  return {
    jarvis,
    jarvisDriver,
    jarvisDemo,
    jarvisUsage: createJarvisUsagePresenter(ports.jarvisUsage, lifetime),
    workspace,
  };
}

/** A replaying stream's current value, or `undefined` before its first. */
function peekCurrentState<T>(source: Stream<T>): T | undefined {
  return peek<T | undefined>(source, undefined);
}
