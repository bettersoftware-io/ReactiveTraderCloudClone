import { Effect, Stream } from "effect";

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
  Stream as CoreStream,
  ThemeSkinPreferencePresenter,
  WorkspaceNavIntents,
  WorkspaceNavState,
  WorkspaceTab,
} from "@rtc/core-api";
import { LAYOUT_PANEL_IDS } from "@rtc/client-core";
import type {
  CurrencyPair,
  EquityInstrument,
  JarvisSkin,
  PowerSaverLevel,
  Price,
  ThemeSkin,
} from "@rtc/domain";

import { type EffectHost, fromPortIn } from "#/bridge/out";
import { peek } from "#/bridge/peek";
import { createJarvisMachine, wireJarvisHistorySource } from "#/presenters/jarvis";
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
  readonly watchlist$: CoreStream<readonly EquityInstrument[]>;
  readonly themeSkinPreference: ThemeSkinPreferencePresenter;
  readonly powerSaver: PowerSaverPresenter;
  readonly jarvisPreferences: JarvisPreferencesPresenter;
  readonly pairs$: CoreStream<readonly CurrencyPair[]>;
  readonly priceFor: (pair: CurrencyPair) => CoreStream<Price>;
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
 * end outside the Layer graph (like wave 1's workspace), each member on its
 * own child host of `host`, in the RxJS composition's order: `jarvis`, the
 * workspace over its OWN `events$`, the driver — whose outcomes fold back
 * into the transcript — the demo, the narrator, the history source and the
 * usage presenter. The base app stands down (`CoreSeams.nativeJarvis`);
 * closing `host`'s scope ends the whole family.
 */
export function createJarvisFamily(
  host: EffectHost,
  deps: JarvisFamilyDeps,
): JarvisFamily {
  const { ports } = deps;
  const jarvis = createJarvisMachine(host, {
    port: ports.jarvis,
    skin$: ports.preferences.jarvisSkin$(),
    setSkin: (skin: JarvisSkin) => {
      ports.preferences.setJarvisSkin(skin);
    },
    availability$: ports.jarvis.availability$?.(),
    preferredBrain$: ports.preferences.jarvisBrain$(),
    effort$: ports.preferences.jarvisEffort$(),
  });
  const workspace = createNativeWorkspace(host, {
    ports,
    jarvisEvents$: jarvis.handle.events$,
    workspaceNav: deps.workspaceNav,
  });

  function powerSaverLevelNow(): PowerSaverLevel {
    return peek<PowerSaverLevel>(deps.powerSaver.level$, "off");
  }

  const jarvisDriver = createJarvisDriver(host, {
    listenEvents: jarvis.listenEvents,
    powerSaverLevel: powerSaverLevelNow,
    commands: {
      ...workspace.drive,
      switchTab: (tab: WorkspaceTab) => {
        deps.workspaceNav.intents.switchTab(tab);
      },
      eqWorkspace: deps.eqWorkspace.intents,
      eqWorkspaceState: () => {
        return peekCurrent(deps.eqWorkspace.state$);
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
        return peekCurrent(deps.watchlist$)?.map((instrument) => {
          return instrument.symbol;
        });
      },
    },
  });
  host.runtime.runFork(
    fromPortIn(host.scope)(jarvisDriver.outcomes$).pipe(
      Stream.runForEach((outcome) => {
        return Effect.sync(() => {
          jarvis.handle.intents.recordDriveOutcome(outcome);
        });
      }),
    ),
    { scope: host.scope },
  );
  const jarvisDemo = createJarvisDemo(host, {
    jarvisStateNow: jarvis.stateNow,
    listenState: jarvis.listenState,
    listenEvents: jarvis.listenEvents,
    jarvis: jarvis.handle.intents,
    powerSaverLevel: powerSaverLevelNow,
  });
  createNarrator(host, {
    pairs$: deps.pairs$,
    priceFor: deps.priceFor,
    narrate: (prompt: string) => {
      jarvis.handle.intents.narrate(prompt);
    },
    preference$: deps.jarvisPreferences.narrator$,
    config: ports.narratorConfig,
  });
  wireJarvisHistorySource(ports.jarvis, jarvis);

  return {
    jarvis: jarvis.handle,
    jarvisDriver,
    jarvisDemo,
    jarvisUsage: createJarvisUsagePresenter(host, ports.jarvisUsage),
    workspace,
  };
}

/** A replaying stream's current value, or `undefined` before its first. */
function peekCurrent<T>(source: CoreStream<T>): T | undefined {
  return peek<T | undefined>(source, undefined);
}
