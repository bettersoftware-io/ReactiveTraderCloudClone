import { type StateObservable, state } from "@rx-state/core";
import {
  concat,
  from,
  type Observable,
  of,
  type SchedulerLike,
  Subject,
  timer,
} from "rxjs";
import { concatMap, filter, map, scan, take } from "rxjs/operators";

import type {
  DriveOutcome,
  EqWorkspaceIntents,
  JarvisDriverMachineHandle,
  JarvisDriverState,
  LayoutIntents,
  LayoutState,
  Machine,
  WorkspaceNavIntents,
  WorkspaceNavState,
  WorkspaceTab,
} from "@rtc/core-api";
import type { PowerSaverLevel, ThemeSkin } from "@rtc/domain";
import { DRIVE_STAGGER_MS as DOMAIN_DRIVE_STAGGER_MS } from "@rtc/domain";

import type { JarvisEvent } from "#/adapters/jarvisPort";

import type { EqWorkspaceState } from "./EqWorkspaceMachine";
import {
  applyDriveCommand,
  type DriveCommandDeps,
  driveStaggerMs,
} from "./jarvisDriveCommands";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { DriveOutcome, JarvisDriverMachineHandle, JarvisDriverState };

export interface JarvisDriverDeps {
  /** Every reply-turn event, already guarded (`catchError(() => EMPTY)` at
   * the composition call site — `createJarvisPanelsMachine`'s sibling
   * doctrine: this machine's own fold must never see a terminal error). */
  readonly events$: Observable<JarvisEvent>;
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
  /** The panels in `tab` currently living OUTSIDE the grid (floating or
   * popped out), as last reported by the Dockview bridge through
   * `AppCommands.reportDetachedPanels` — read synchronously per `layout`
   * command. The engine refuses collapse/maximize on such a panel, so the
   * driver REFUSES `maximize`/`collapse`/`expand` on it (a `"refused"`
   * outcome, never calling the layout intent) instead of recording an intent
   * the engine never applied. Session-only; never part of `LayoutState`. */
  readonly detachedPanelIds: (tab: WorkspaceTab) => readonly string[];
  /** Every currently-live desk panel id (floating + docked) — the
   * `dockPanel` command's "does this panel exist at all" gate, read fresh
   * per command like `knownSymbols$`. Source: `JarvisPanelsState.panels`. */
  readonly livePanelIds$: Observable<readonly string[]>;
  /** Every currently-docked desk panel id — the `dockPanel` "already
   * docked" / dock-count gate and the `undockPanel` "not docked" gate, both
   * read fresh per command. Source: `JarvisPanelsState.panels`, filtered on
   * `docked`. Also widens the `layout` command's membership gate: a docked
   * panel is invisible to `knownLayoutPanelIds` (the STATIC default-layout
   * tree) but still a legitimate `layout` target once docked into the
   * workspace. */
  readonly dockedPanelIds$: Observable<readonly string[]>;
  /** Latest known equity symbols — the `eqSelect` command's membership
   * check. */
  readonly knownSymbols$: Observable<readonly string[]>;
  /** Latest power-saver level — read fresh per command to decide its
   * stagger (0 under `"freeze"`, `DRIVE_STAGGER_MS` otherwise). */
  readonly powerSaverLevel$: Observable<PowerSaverLevel>;
  /** Injected for ALL time in this machine (every `timer`) — a `TestScheduler`
   * in tests, `undefined` (rxjs's own `asyncScheduler` default) in
   * production. */
  readonly scheduler?: SchedulerLike;
}

/** How far apart (ms) each command after the first, within one batch, is
 * applied — the visible "step by step" choreography. The batch's own FIRST
 * command always fires immediately (no dead pause before the desk visibly
 * reacts to a drive turn); this constant governs the gap BETWEEN commands
 * only. Collapses to 0 under power-saver `"freeze"` (read fresh per command
 * from `powerSaverLevel$`), per the motion-free guarantee
 * `docs/performance.md`/`docs/power-saver-mode.md` demand. */
export const DRIVE_STAGGER_MS: number = DOMAIN_DRIVE_STAGGER_MS;

const INITIAL_STATE: JarvisDriverState = { lastBatch: [] };

// A named tag (rather than an inline `{ type: "command" }` literal) so
// `Extract<JarvisEvent, ...>` never takes an inline object type argument —
// mirrors JarvisPanelsMachine.ts's identical PanelTag idiom (the repo's
// `no-restricted-syntax` bans inline object types even as a type argument).
interface CommandEventTag {
  readonly type: "command";
}
type CommandEvent = Extract<JarvisEvent, CommandEventTag>;

function isCommandEvent(event: JarvisEvent): event is CommandEvent {
  return event.type === "command";
}

type Patch = (s: JarvisDriverState) => JarvisDriverState;

/** Reads the CURRENT value of a warm/replaying Observable synchronously, or
 * `undefined` if nothing has emitted yet — same idiom as `composition.ts`'s
 * `readPreferenceNow` (not reused directly: that helper is
 * composition-private and always substitutes a fallback, which would hide
 * "nothing emitted yet" from a caller that needs to tell that apart from "a
 * real empty value arrived"; see `readNow` and the `eqSelect` case below). */
function readLatest<T>(source$: Observable<T>): T | undefined {
  let value: T | undefined;
  const sub = source$.pipe(take(1)).subscribe((v) => {
    value = v;
  });
  sub.unsubscribe();
  return value;
}

/** `readLatest` with a fallback substituted for "nothing emitted yet" —
 * correct for every source this machine reads EXCEPT `knownSymbols$`, whose
 * `eqSelect` membership check needs to distinguish that case from "a real,
 * loaded list that doesn't contain this symbol" (see the `eqSelect` case
 * below). Relies on `eqWorkspace.state$`/`powerSaverLevel$` being
 * warm/replay-backed by construction, so the fallback there is defensive
 * only, never actually exercised in a correctly-composed app. */
function readNow<T>(source$: Observable<T>, fallback: T): T {
  return readLatest(source$) ?? fallback;
}

/** Adapts this machine's observable deps to the shared interpreter's
 * synchronous readers (`./jarvisDriveCommands`). */
function createCommandDeps(deps: JarvisDriverDeps): DriveCommandDeps {
  return {
    switchTab: (tab: WorkspaceTab) => {
      deps.workspaceNav.intents.switchTab(tab);
    },
    layout: deps.layout,
    eqWorkspace: deps.eqWorkspace.intents,
    eqWorkspaceState: () => {
      return readLatest(deps.eqWorkspace.state$);
    },
    setThemeSkin: deps.setThemeSkin,
    setPowerSaver: deps.setPowerSaver,
    dismissPanel: deps.dismissPanel,
    dockPanel: deps.dockPanel,
    undockPanel: deps.undockPanel,
    knownLayoutPanelIds: deps.knownLayoutPanelIds,
    detachedPanelIds: deps.detachedPanelIds,
    livePanelIds: () => {
      return readNow(deps.livePanelIds$, []);
    },
    dockedPanelIds: () => {
      return readNow(deps.dockedPanelIds$, []);
    },
    knownSymbols: () => {
      return readLatest(deps.knownSymbols$);
    },
  };
}

/**
 * Session-lifetime fold over the Jarvis event stream's `"command"` events: a
 * TOTAL interpreter that turns each `DriveBatchV1`'s commands into intent
 * dispatches on the app's machines, choreographed `DRIVE_STAGGER_MS` apart
 * (0 under power-saver freeze). Created once at composition (mirrors
 * `JarvisPanelsMachine`'s doc) — NOT per overlay mount.
 *
 * Batches queue: a second `"command"` event arriving mid-stagger does not
 * interleave with the first — the outer `concatMap` doesn't subscribe to it
 * until the first batch's own commands have all been applied. Within one
 * batch, commands apply strictly in order (inner `concatMap` over a fresh
 * `timer` per command). The FIRST command of a batch applies immediately —
 * no dead pause before the desk visibly reacts to a drive turn — and the
 * stagger applies only BETWEEN subsequent commands (a 3-command batch lands
 * at frames `[t, t+DRIVE_STAGGER_MS, t+2*DRIVE_STAGGER_MS]`, still `[t, t,
 * t]` under freeze since `staggerMsFor` already collapses to 0 there).
 *
 * `state.lastBatch` resets to `[]` at the start of each new batch (a
 * synchronous `concat`-prepended patch, before that batch's first command
 * lands) and then grows one entry per applied/skipped command, so a
 * consumer watching `state$` mid-batch sees it fill in step by step —
 * exactly what the UI's driven-pulse cue (a later task) animates against.
 */
export function createJarvisDriverMachine(
  deps: JarvisDriverDeps,
): JarvisDriverMachineHandle {
  // Plain hot Subject, never completed — see JarvisDriverMachineHandle's
  // `outcomes$` doc for the no-teardown-seam rationale. Nexted from the SAME
  // `map()` callback that computes each command's outcome (below), so its
  // emission order/timing is identical to how `lastBatch` fills in.
  const outcomes$ = new Subject<DriveOutcome>();
  const commandDeps = createCommandDeps(deps);

  const patches$: Observable<Patch> = deps.events$.pipe(
    filter(isCommandEvent),
    concatMap((event) => {
      const resetPatch$: Observable<Patch> = of((): JarvisDriverState => {
        return { lastBatch: [] };
      });

      const commandPatches$: Observable<Patch> = from(
        event.batch.commands,
      ).pipe(
        concatMap((cmd, index) => {
          // The batch's own first command (index 0) fires immediately — see
          // this function's doc. Every later command reads powerSaverLevel$
          // fresh, right before it schedules its own wait.
          const staggerMs = driveStaggerMs(
            index,
            readNow(deps.powerSaverLevel$, "off"),
          );

          return timer(staggerMs, deps.scheduler).pipe(
            map((): Patch => {
              const outcome = applyDriveCommand(cmd, commandDeps);
              outcomes$.next(outcome);

              return (s: JarvisDriverState): JarvisDriverState => {
                return { lastBatch: [...s.lastBatch, outcome] };
              };
            }),
          );
        }),
      );

      return concat(resetPatch$, commandPatches$);
    }),
  );

  const stream$ = patches$.pipe(
    scan((s, patch): JarvisDriverState => {
      return patch(s);
    }, INITIAL_STATE),
  );

  const state$: StateObservable<JarvisDriverState> = state(
    stream$,
    INITIAL_STATE,
  );

  // Keep state$ warm, same rationale as JarvisPanelsMachine/EqWorkspaceMachine:
  // a cold state()/shareReplay stream with no live subscriber can drop a
  // batch fired between one consumer unmounting and the next mounting.
  // outcomes$ needs no equivalent warm subscription: it's a plain Subject
  // (not a shared/refcounted state() stream), and composition.ts's
  // recordDriveOutcome wiring subscribes it directly, for the app's whole
  // session, before any batch can fire.
  state$.subscribe();

  return { state$, outcomes$ };
}
