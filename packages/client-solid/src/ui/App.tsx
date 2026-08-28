import type { JSX } from "solid-js";
import { createMemo, lazy, Show, Suspense, untrack } from "solid-js";

import { PANEL_SPECS } from "@rtc/client-core";
import { useViewModel } from "@rtc/solid-bindings";

import { CreditViewProvider } from "#/ui/credit/CreditViewProvider";
import { FxViewProvider } from "#/ui/fx/FxViewProvider";

import { AmbientBackground } from "./shell/background/AmbientBackground";
import { HeaderChrome, type WorkspaceTab } from "./shell/chrome/HeaderChrome";
import { ConnectionOverlay } from "./shell/connection/ConnectionOverlay";
import { JarvisOverlay } from "./shell/jarvis/JarvisOverlay";
import { JarvisPanelLayer } from "./shell/jarvis/panels/JarvisPanelLayer";
import { useJarvisDrivenPulse } from "./shell/jarvis/useJarvisDrivenPulse";
import {
  appHeadRegistry,
  dockedHeadsFor,
} from "./shell/layout/engine/appHeadRegistry";
import {
  appPanelRegistry,
  dockedRegistryFor,
  dockedSpecsFor,
} from "./shell/layout/engine/appPanelRegistry";
import { InhouseLayoutEngine } from "./shell/layout/engine/InhouseLayoutEngine";
import { LockScreen } from "./shell/lock/LockScreen";
import { StatusBar } from "./shell/status/StatusBar";

import styles from "./App.module.css";
import drivenPulseStyles from "./shell/jarvis/DrivenPulse.module.css";

/** Shell chrome wired to the real ViewModel (Task 9 — theme/chrome/boot/lock)
 * plus one shared WorkspaceEngine serving every tab's live layout engine and
 * panel subtree: FX (Tasks 10/13), Credit (Task 14), Equities (Task 15), and
 * Admin (Task 16), all through the SAME `appPanelRegistry`/`appHeadRegistry`,
 * keyed by panel id — the exact structure of the react `App.tsx`. */
export function App(): JSX.Element {
  // Machine-backed nav (Task 10/11 parity): the promoted composition-root
  // singleton (Presenters.workspaceNav) replacing the createSignal<WorkspaceTab>
  // that used to live here — reachable now from Jarvis's drive-the-app
  // "switchTab" command too. The keyed `<Show>` below is unchanged:
  // WorkspaceEngine still remounts per tab, but the underlying layout
  // machines now survive that remount (see Presenters.layoutFor's doc).
  const { useWorkspaceNav } = useViewModel();
  const { state: navState, switchTab } = useWorkspaceNav();
  const pulse = useJarvisDrivenPulse();

  return (
    <div class={styles.app}>
      <AmbientBackground />
      <HeaderChrome activeTab={navState().activeTab} onTabChange={switchTab} />
      <div
        ref={pulse.ref}
        data-jarvis-driven={pulse.pulsing() ? "true" : "false"}
        class={
          pulse.pulsing()
            ? `${styles.workspaceRegion} ${drivenPulseStyles.driven}`
            : styles.workspaceRegion
        }
      >
        <Show when={navState().activeTab} keyed>
          {(tab: WorkspaceTab) => {
            return <WorkspaceEngine tab={tab} />;
          }}
        </Show>
      </div>
      <StatusBar />
      <ConnectionOverlay />
      <LockScreen />
      <JarvisOverlay />
      <JarvisPanelLayer />
    </div>
  );
}

interface WorkspaceEngineProps {
  tab: WorkspaceTab;
}

// Lazy: dockview + its CSS is ~75KB gzip, but the default in-house engine
// serves ~100% of users — split it into its own chunk instead of shipping
// it to everyone.
const DockviewLayoutEngine = lazy(() => {
  return import("./shell/layout/dockview/DockviewLayoutEngine").then((m) => {
    return { default: m.DockviewLayoutEngine };
  });
});

/** Owns the active tab's `useLayout(tab)` machine and nests BOTH domain
 * view-context seams (`FxViewProvider` → `CreditViewProvider`), mirroring the
 * react `App.tsx`'s single `WorkspaceEngine` that serves all tabs from one
 * component. The keyed `<Show>` in `App` is the Solid-native equivalent of
 * the react original's `key={activeTab}` forced remount: switching tabs
 * genuinely unmounts this component and mounts a fresh one for the new tab
 * — which is also why reading `props.tab` once at setup is intentional here:
 * the component can never see a different tab within one lifetime.
 * `useLayout(tab)` no longer disposes anything on that unmount (Task 10/11):
 * `machines.layout(tab)` resolves to a composition-root SINGLETON per tab
 * (`Presenters.layoutFor`), read directly via `toSignal`, so layout state
 * (maximized/collapsed/split sizes) SURVIVES this remount instead of
 * resetting — a driven "layout" DriveCommand's target stays the same
 * instance the mounted view reads from either way. */
function WorkspaceEngine(props: WorkspaceEngineProps): JSX.Element {
  const { useLayout, useJarvisPanels, useLayoutEngine, useDockLayoutStore } =
    useViewModel();

  const { state, maximize, restore, collapse, expand, resize } = useLayout(
    // eslint-disable-next-line solid/reactivity -- setup-scope read is correct under the keyed-<Show> remount (see doc comment)
    props.tab,
  );
  // Docked desk panels render as leaves inside THIS engine (not the
  // floating JarvisPanelLayer, which renders floatingPanels only) — merged
  // on top of the static app registries so a dock/undock is reflected on
  // the very next reactive tick, regardless of which tab the panel was
  // docked into. createMemo (not inline object literals, unlike react's own
  // version of this merge): Solid has no compiler to memoize an inline
  // `{...a, ...b}` for us, and these three merges feed straight into
  // InhouseLayoutEngine's props.
  //
  // IDENTITY CHURN GUARD (fix round 1, review Critical finding): `registry`/
  // `headRegistry` hold COMPONENT-PRODUCING closures, rendered through
  // InhouseLayoutEngine's `PanelLeaf` at a TRACKED JSX "insert" position
  // (`{props.registry[props.panelId]?.()}` / `{props.headRegistry?.[...]?.()}`
  // — see that file). Solid disposes and re-mounts whatever that position
  // last inserted whenever the read object's REFERENCE changes — not just
  // the one panel that changed, EVERY leaf currently in the tab's tree,
  // since they all read through the same `registry`/`headRegistry` object.
  // `dockedPanels()` is NOT a safe memo dependency for these two: its
  // underlying stream (`JarvisPanelsPresenter.dockedPanels$`) is built by
  // `.filter()` over `panels$`, which itself `.map()`s a fresh array on
  // EVERY `JarvisPanelsMachine` state change — spawn, edit, dismiss, dock,
  // *or* undock of ANY panel, not only a change to DOCKED membership. A
  // memo that reads `dockedPanels()` directly would therefore recompute (and
  // hand `InhouseLayoutEngine` a fresh-identity registry/headRegistry) on
  // every one of those unrelated ticks, remounting every already-mounted
  // panel and losing its in-flight component state (form drafts, scroll
  // position, canvas state) along with every `shareReplay({refCount:true})`
  // port subscription it owned (the stream-resubscribe trap — see #171-#173).
  //
  // Fix: gate identity on the DOCKED ID SET, not the row array. `dockedIds`
  // reduces `dockedPanels()` to a SORTED array of ids, with a CUSTOM `equals`
  // (element-wise compare) as the memo's own change gate — NOT a joined
  // string: `panelId` is a freeform string validated only for length 1..64
  // (see `driveCommand.ts`'s dock-command guard), no charset restriction, so
  // a wire-minted id CAN legally contain a comma. `CreditBlotter.tsx`'s
  // `tradeIdsKey`/`RfqsPanel.tsx`'s `allIdsKey` join NUMBER arrays, where a
  // comma is structurally impossible in an element — that plain-join idiom
  // is unsound here: id `"x,y"` alone would key identically to ids `"x"` +
  // `"y"` together, so a membership transition between colliding sets
  // wouldn't re-key at all (registries would go silently stale, rendering
  // nothing for a real docked panel) — a round-trip through a joined string
  // has the same problem the other direction, splitting `"x,y"` back into
  // two wrong ids even with no collision in play. An array-valued memo with
  // an element-wise `equals` sidesteps encoding entirely — there is no
  // string for two distinct id sets to collide into. This memo's own
  // computation reruns on every `dockedPanels()` tick (cheap: ≤
  // `MAX_DOCKED_PANELS` short strings, sorted), but `equals` short-circuits
  // propagation to its dependents (`registry`/`specs`/`headRegistry` below)
  // whenever the SET is unchanged. `dockedPanels` (the accessor itself, a
  // stable function reference for this component's whole lifetime) is
  // threaded down into `dockedRegistryFor`/`dockedHeadsFor` so each docked
  // panel's body/head can look up its OWN current row reactively and update
  // in place — a restyle ("make it a table") while docked, or a title
  // rename, updates that one mounted leaf's content directly, without ever
  // touching `registry`/`headRegistry`'s identity or remounting anything.
  const { dockedPanels, undockPanel, dismissPanel } = useJarvisPanels();

  const dockedIds = createMemo<readonly string[]>(
    () => {
      return dockedPanels()
        .map((panel) => {
          return panel.panelId;
        })
        .sort();
    },
    [],
    {
      equals: (prev: readonly string[], next: readonly string[]): boolean => {
        return (
          prev.length === next.length &&
          prev.every((id, index) => {
            return id === next[index];
          })
        );
      },
    },
  );

  const registry = createMemo(() => {
    return {
      ...appPanelRegistry,
      ...dockedRegistryFor(dockedIds(), dockedPanels),
    };
  });

  // `specs` is plain data (id/title only), never a component-producing
  // closure, so its OWN identity churning would be harmless for remounting
  // — InhouseLayoutEngine's PanelLeaf reads it only at plain text/attribute
  // JSX positions (title spans, aria-labels), which update in place
  // regardless of object identity. Still gated the same way as the other
  // two, per the fix's uniform-identity shape: `untrack(dockedPanels)`
  // reads the CURRENT rows without subscribing to their churn, so this
  // memo's own identity is likewise stable across a same-membership tick —
  // its captured `title` only refreshes on the next dock/undock, not on a
  // later restyle (the docked head's own reactive title lookup below is
  // what stays live for that; PANEL_SPECS's title is a maximize/collapse
  // aria-label fallback only, never the primary display for a docked panel).
  const specs = createMemo(() => {
    return {
      ...PANEL_SPECS,
      ...dockedSpecsFor(dockedIds(), untrack(dockedPanels)),
    };
  });

  const headRegistry = createMemo(() => {
    return {
      ...appHeadRegistry,
      ...dockedHeadsFor(dockedIds(), dockedPanels, undockPanel, dismissPanel),
    };
  });

  const { engine } = useLayoutEngine();
  const dockLayoutStore = useDockLayoutStore();

  return (
    <FxViewProvider>
      <CreditViewProvider>
        <Show
          when={engine() === "dockview"}
          fallback={
            <InhouseLayoutEngine
              state={state()}
              registry={registry()}
              specs={specs()}
              headRegistry={headRegistry()}
              onMaximize={maximize}
              onRestore={restore}
              onCollapse={collapse}
              onExpand={expand}
              onResize={resize}
            />
          }
        >
          <Suspense fallback={null}>
            {/* Same merged registries as the in-house branch: dockview looks
                a docked panel's body/head/spec up by id exactly as the
                in-house engine does. Its SEED tree is still the static
                default (createDefaultLayoutPort), so a pinned panel only
                surfaces here once its id is in the persisted blob — docking
                a Jarvis panel INTO dockview is not wired this round. */}
            <DockviewLayoutEngine
              tab={props.tab}
              registry={registry()}
              specs={specs()}
              headRegistry={headRegistry()}
              store={dockLayoutStore}
              maximized={state().maximized}
              collapsed={state().collapsed}
              onMaximize={maximize}
              onRestore={restore}
              onCollapse={collapse}
              onExpand={expand}
            />
          </Suspense>
        </Show>
      </CreditViewProvider>
    </FxViewProvider>
  );
}
