import type { SchedulerLike } from "rxjs";

import type { PowerSaverLevel, ThemeSkin } from "@rtc/domain";
import type { DriveCommandV1, JarvisEvent } from "@rtc/shared";

import type { LayoutState, WorkspaceTab } from "#/layout";
import type { Machine } from "#/machine";
import type {
  EqWorkspaceIntents,
  EqWorkspaceState,
} from "#/machines/eqWorkspace";
import type { LayoutIntents } from "#/machines/layout";
import type {
  WorkspaceNavIntents,
  WorkspaceNavState,
} from "#/machines/workspaceNav";
import type { StateStream, Stream } from "#/stream";

/** One command's application result — `"skipped"` covers both a membership
 * miss (unknown `panelId`/`symbol`) and a no-op setter already at the
 * requested value; `reason` is present only for `"skipped"`. */
export type DriveOutcome = {
  readonly command: DriveCommandV1;
  readonly status: "applied" | "skipped";
  readonly reason?: string;
};

export interface JarvisDriverState {
  readonly lastBatch: readonly DriveOutcome[];
}

/** `createJarvisDriverMachine`'s return — named to match the
 * `JarvisPanelsMachineHandle`/`WorkspaceNavMachine` sibling idiom. No
 * `dispose`: like `JarvisPanelsMachineHandle`, this is a session-lifetime
 * composition singleton with no per-consumer teardown seam. */
export interface JarvisDriverMachineHandle {
  readonly state$: StateStream<JarvisDriverState>;
  /** Emits once per command, in APPLICATION order (i.e. staggered exactly
   * like `state$.lastBatch` fills in — the two are nexted from the same
   * `map()` callback) — both `"applied"` AND `"skipped"` outcomes flow
   * through here, unfiltered. `composition.ts` subscribes this into
   * `JarvisMachine.intents.recordDriveOutcome`, which does its own
   * applied-only filtering when folding a transcript row — see that
   * intent's doc for why the filter lives there and not here. Never
   * completes: same session-lifetime, no-teardown-seam doctrine as
   * `state$` above. */
  readonly outcomes$: Stream<DriveOutcome>;
}

export interface JarvisDriverDeps {
  /** Every reply-turn event, already guarded (`catchError(() => EMPTY)` at
   * the composition call site — `createJarvisPanelsMachine`'s sibling
   * doctrine: this machine's own fold must never see a terminal error). */
  readonly events$: Stream<JarvisEvent>;
  /** The app's active-tab singleton — `switchTab` commands target this. */
  readonly workspaceNav: Machine<WorkspaceNavState, WorkspaceNavIntents>;
  /** Per-tab layout machine SINGLETON accessor — the SAME `Presenters.layoutFor`
   * `createMachineFactories`'s own `layout` field resolves to (Task 10's
   * resolution of a documented Task 6 review deferral: this used to be a
   * fresh-per-call factory, so a driven "layout" command mutated a
   * throwaway instance nothing else ever read from). Calling it with the
   * same `tab` always returns the exact instance the mounted `useLayout(tab)`
   * view reads from, so a "layout" DriveCommand is now observable through
   * the real UI. */
  readonly layout: (tab: WorkspaceTab) => Machine<LayoutState, LayoutIntents>;
  /** Cross-panel equities workspace singleton — `eqSelect`/`eqTimeframe`/
   * `eqChartType`/`eqIndicator`/`eqPane` commands target this directly,
   * regardless of which tab is active (mirrors `EqWorkspaceMachine`'s own
   * "shared source of truth" doc). */
  readonly eqWorkspace: Machine<EqWorkspaceState, EqWorkspaceIntents>;
  /** Thin closure over `ThemeSkinPreferencePresenter.setSkin` — composition
   * supplies it so this machine never imports a Presenter class directly. */
  readonly setThemeSkin: (skin: ThemeSkin) => void;
  /** Thin closure over `PowerSaverPresenter.setLevel`. */
  readonly setPowerSaver: (level: PowerSaverLevel) => void;
  /** `JarvisPanelsMachineHandle.dismissPanel` (already an idempotent no-op
   * for an unknown desk-panel id, so `dismissPanel` commands never need a
   * membership pre-check the way `layout`/`eqSelect` do). */
  readonly dismissPanel: (panelId: string) => void;
  /** `JarvisPanelsMachineHandle.dockPanel` — the `dockPanel` command's
   * effect, applied only after this machine's own membership/already-docked/
   * dock-full pre-checks pass (unlike `dismissPanel`, docking is NOT
   * idempotent-safe to call blindly: the reducer's own no-op guards exist,
   * but `dockPanel`'s `DriveOutcome` needs to tell "already docked" and
   * "dock full" apart, which only this machine's own reads of
   * `livePanelIds$`/`dockedPanelIds$` can do). */
  readonly dockPanel: (panelId: string) => void;
  /** `JarvisPanelsMachineHandle.undockPanel` — the `undockPanel` command's
   * effect, applied only after the `dockedPanelIds$` membership check below. */
  readonly undockPanel: (panelId: string) => void;
  /** The static panel ids in `tab`'s default layout tree (e.g. "fx-rates",
   * "eq-chart") — the `layout` command's membership check. */
  readonly knownLayoutPanelIds: (tab: WorkspaceTab) => readonly string[];
  /** Every currently-live desk panel id (floating + docked) — the
   * `dockPanel` command's "does this panel exist at all" gate, read fresh
   * per command like `knownSymbols$`. Source: `JarvisPanelsState.panels`. */
  readonly livePanelIds$: Stream<readonly string[]>;
  /** Every currently-docked desk panel id — the `dockPanel` "already
   * docked" / dock-count gate and the `undockPanel` "not docked" gate, both
   * read fresh per command. Source: `JarvisPanelsState.panels`, filtered on
   * `docked`. Also widens the `layout` command's membership gate: a docked
   * panel is invisible to `knownLayoutPanelIds` (the STATIC default-layout
   * tree) but still a legitimate `layout` target once docked into the
   * workspace. */
  readonly dockedPanelIds$: Stream<readonly string[]>;
  /** Latest known equity symbols — the `eqSelect` command's membership
   * check. */
  readonly knownSymbols$: Stream<readonly string[]>;
  /** Latest power-saver level — read fresh per command to decide its
   * stagger (0 under `"freeze"`, `DRIVE_STAGGER_MS` otherwise). */
  readonly powerSaverLevel$: Stream<PowerSaverLevel>;
  /** Injected for ALL time in this machine (every `timer`) — a `TestScheduler`
   * in tests, `undefined` (rxjs's own `asyncScheduler` default) in
   * production. */
  readonly scheduler?: SchedulerLike;
}
