import {
  AmbientBackground,
  AnimationProbe,
  BootGate,
  BootSequence,
  ConnectionOverlay,
  ConnectionStatusBar,
  HeaderChrome,
  LayoutEngine,
  LockScreen,
  PreferencesModal,
  StatusBar,
  ThemePicker,
  ThemeToggle,
} from "@ui-contract/components";
import type {
  ComponentToken,
  MountedComponent,
} from "@ui-contract/harness/component";
import type { Accessor, JSX } from "solid-js";

import type { PanelId } from "@rtc/client-core";

import { AmbientBackground as AmbientBackgroundComponent } from "#/ui/shell/background/AmbientBackground";
import { BootGate as BootGateComponent } from "#/ui/shell/boot/BootGate";
import { BootSequence as BootSequenceComponent } from "#/ui/shell/boot/BootSequence";
import {
  HeaderChrome as HeaderChromeComponent,
  type WorkspaceTab,
} from "#/ui/shell/chrome/HeaderChrome";
import { ThemePicker as ThemePickerComponent } from "#/ui/shell/chrome/ThemePicker";
import { ConnectionOverlay as ConnectionOverlayComponent } from "#/ui/shell/connection/ConnectionOverlay";
import { ConnectionStatusBar as ConnectionStatusBarComponent } from "#/ui/shell/connection/ConnectionStatusBar";
import { LockScreen as LockScreenComponent } from "#/ui/shell/lock/LockScreen";
import { PreferencesModal as PreferencesModalComponent } from "#/ui/shell/prefs/PreferencesModal";
import { StatusBar as StatusBarComponent } from "#/ui/shell/status/StatusBar";
import { ThemeToggle as ThemeToggleComponent } from "#/ui/shell/theme/ThemeToggle";

import { AnimationProbe as AnimationProbeComponent } from "./AnimationProbe";
import { LayoutEngineHost } from "./LayoutEngineHost";

type AnyToken = ComponentToken<unknown, MountedComponent<unknown>>;
/** token → Solid element builder. Receives the props ACCESSOR (not a
 * resolved snapshot) — see PropsHost.tsx's doc comment for why every field
 * read below is a call (`p().foo`), not a destructure: Solid components run
 * their setup body once, so only a call expression inside the JSX attribute
 * position stays reactive across a later `setProps`. Identity-keyed; no
 * string keys (mirrors the react registry). */
type ElementFor = (props: Accessor<Record<string, unknown>>) => JSX.Element;

/**
 * Entries for every shell/layout component ported to `@rtc/client-solid` so
 * far (Phase 2 Tasks 9-10). FX/Credit/Equities/Admin tokens land with their
 * own Tasks (12+) — mounting one of those today throws from render.tsx's
 * "no registry entry" branch, which doubles as the "not ported yet" signal:
 * `ComponentToken` is deliberately identity-keyed with no name field (see the
 * react registry's own comment), so there is no token label to embed in a
 * more specific message.
 */
export const registry = new Map<AnyToken, ElementFor>([
  [
    AnimationProbe,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <AnimationProbeComponent
          target={(p().target as string) ?? "tile:EURUSD"}
        />
      );
    },
  ],
  [
    BootSequence,
    (): JSX.Element => {
      return <BootSequenceComponent onDone={(): void => {}} />;
    },
  ],
  [
    BootGate,
    (): JSX.Element => {
      return (
        <BootGateComponent>
          <div data-testid="boot-gate-child" />
        </BootGateComponent>
      );
    },
  ],
  [
    ConnectionStatusBar,
    (): JSX.Element => {
      return <ConnectionStatusBarComponent />;
    },
  ],
  [
    ConnectionOverlay,
    (): JSX.Element => {
      return <ConnectionOverlayComponent />;
    },
  ],
  [
    StatusBar,
    (): JSX.Element => {
      return <StatusBarComponent />;
    },
  ],
  [
    HeaderChrome,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <HeaderChromeComponent
          activeTab={(p().activeTab as WorkspaceTab) ?? "fx"}
          onTabChange={
            (p().onTabChange as (t: WorkspaceTab) => void) ?? ((): void => {})
          }
        />
      );
    },
  ],
  [
    ThemePicker,
    (): JSX.Element => {
      return <ThemePickerComponent />;
    },
  ],
  [
    ThemeToggle,
    (): JSX.Element => {
      return <ThemeToggleComponent />;
    },
  ],
  [
    LayoutEngine,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      const customHeadPanelIds =
        (p().customHeadPanelIds as readonly string[] | undefined) ?? [];
      const headRegistry: Partial<Record<PanelId, () => JSX.Element>> = {};

      for (const id of customHeadPanelIds) {
        headRegistry[id] = (): JSX.Element => {
          return <span data-testid="custom-head">Custom head for {id}</span>;
        };
      }

      return (
        <LayoutEngineHost
          headRegistry={headRegistry}
          pinnedFixture={(p().pinnedFixture as boolean | undefined) ?? false}
        />
      );
    },
  ],
  [
    LockScreen,
    (): JSX.Element => {
      return <LockScreenComponent />;
    },
  ],
  [
    AmbientBackground,
    (): JSX.Element => {
      return <AmbientBackgroundComponent />;
    },
  ],
  [
    PreferencesModal,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <PreferencesModalComponent
          open={(p().open as boolean) ?? false}
          onClose={(p().onClose as () => void) ?? ((): void => {})}
        />
      );
    },
  ],
]);
