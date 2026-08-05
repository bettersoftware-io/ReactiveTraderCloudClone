import { type StateObservable, state } from "@rx-state/core";
import {
  concat,
  from,
  type Observable,
  of,
  type SchedulerLike,
  timer,
} from "rxjs";
import { concatMap, filter, map, scan, take } from "rxjs/operators";

import type { PowerSaverLevel, ThemeSkin } from "@rtc/domain";
import type { DriveCommandV1 } from "@rtc/shared";

import type { JarvisEvent } from "#/adapters/jarvisPort";
import type { WorkspaceTab } from "#/layout/defaultLayoutPort";
import type { LayoutState } from "#/layout/layoutPort";

import type {
  EqWorkspaceIntents,
  EqWorkspaceState,
} from "./EqWorkspaceMachine";
import type { LayoutIntents } from "./LayoutMachine";
import type { Machine } from "./machine";
import type {
  WorkspaceNavIntents,
  WorkspaceNavState,
} from "./WorkspaceNavMachine";

/** How far apart (ms) successive commands within one batch are applied —
 * the visible "step by step" choreography. Collapses to 0 under power-saver
 * `"freeze"` (read fresh per command from `powerSaverLevel$`), per the
 * motion-free guarantee `docs/performance.md`/`docs/power-saver-mode.md`
 * demand. */
export const DRIVE_STAGGER_MS = 350;

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
  readonly state$: StateObservable<JarvisDriverState>;
}

export interface JarvisDriverDeps {
  /** Every reply-turn event, already guarded (`catchError(() => EMPTY)` at
   * the composition call site — `createJarvisPanelsMachine`'s sibling
   * doctrine: this machine's own fold must never see a terminal error). */
  readonly events$: Observable<JarvisEvent>;
  /** The app's active-tab singleton — `switchTab` commands target this. */
  readonly workspaceNav: Machine<WorkspaceNavState, WorkspaceNavIntents>;
  /** Per-tab layout machine factory — the SAME factory `MachineFactories.layout`
   * exposes to the UI (a fresh instance per call; `machine.ts`'s own doc:
   * "each builds a fresh machine instance per component mount"). Called
   * fresh here too, never cached across commands — caching a returned
   * instance across the driver's own lifetime would only diverge further
   * from whatever the UI mounts, and risks the exact dispose-on-unmount
   * collision Task 5's review caught for `workspaceNav` (see its report). */
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
  /** The static panel ids in `tab`'s default layout tree (e.g. "fx-rates",
   * "eq-chart") — the `layout` command's membership check. */
  readonly knownLayoutPanelIds: (tab: WorkspaceTab) => readonly string[];
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

const INITIAL_STATE: JarvisDriverState = { lastBatch: [] };

const FALLBACK_EQ_STATE: EqWorkspaceState = {
  sel: "",
  openTabs: [],
  timeframe: "1D",
  chartType: "candles",
  indicators: [],
  panes: [],
  yScale: "linear",
};

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

// Same named-tag idiom as CommandEventTag above, for the "layout" branch of
// DriveCommandV1 — `Extract<DriveCommandV1, { readonly kind: "layout" }>`
// inline would be an inline object type as a type argument, also banned.
interface LayoutCommandTag {
  readonly kind: "layout";
}
type LayoutCommand = Extract<DriveCommandV1, LayoutCommandTag>;

type Patch = (s: JarvisDriverState) => JarvisDriverState;

/** Reads the CURRENT value of a warm/replaying Observable synchronously —
 * same idiom as `composition.ts`'s `readPreferenceNow` (not reused directly:
 * that helper is composition-private), relying on every source this machine
 * reads (`eqWorkspace.state$`, `knownSymbols$`, `powerSaverLevel$`) being
 * warm/replay-backed by construction. */
function readNow<T>(source$: Observable<T>, fallback: T): T {
  let value: T | undefined;
  const sub = source$.pipe(take(1)).subscribe((v) => {
    value = v;
  });
  sub.unsubscribe();
  return value ?? fallback;
}

function applyLayoutCommand(
  cmd: LayoutCommand,
  deps: JarvisDriverDeps,
): DriveOutcome {
  const known = deps.knownLayoutPanelIds(cmd.tab);

  if (!known.includes(cmd.panelId)) {
    return {
      command: cmd,
      status: "skipped",
      reason: `unknown panelId "${cmd.panelId}" for tab "${cmd.tab}"`,
    };
  }

  const machine = deps.layout(cmd.tab);

  switch (cmd.op) {
    case "maximize":
      machine.intents.maximize(cmd.panelId);
      break;
    case "restore":
      machine.intents.restore();
      break;
    case "collapse":
      machine.intents.collapse(cmd.panelId);
      break;
    case "expand":
      machine.intents.expand(cmd.panelId);
      break;

    default:
      return { command: cmd, status: "skipped", reason: "unknown layout op" };
  }

  return { command: cmd, status: "applied" };
}

/** Applies one `DriveCommandV1` to the injected machines/presenters and
 * reports what happened. TOTAL by construction (the `composePanelStream`
 * doctrine): every branch returns a `DriveOutcome`, nothing throws, and an
 * unrecognized `kind` (unreachable through the closed union, reachable only
 * via a test's cast) falls through to a genuine `"skipped"` outcome rather
 * than the `_exhaustive: never` shortcut some sibling interpreters use —
 * that shortcut would hand a malformed value back typed as a real
 * `DriveOutcome`, exactly the crash risk `composePanelStream.ts`'s
 * `unknownSourceFrame` doc warns against. */
function applyCommand(
  cmd: DriveCommandV1,
  deps: JarvisDriverDeps,
): DriveOutcome {
  switch (cmd.kind) {
    case "switchTab":
      deps.workspaceNav.intents.switchTab(cmd.tab);
      return { command: cmd, status: "applied" };

    case "layout":
      return applyLayoutCommand(cmd, deps);

    case "eqSelect": {
      const knownSymbols = readNow(deps.knownSymbols$, []);

      if (!knownSymbols.includes(cmd.symbol)) {
        return {
          command: cmd,
          status: "skipped",
          reason: `unknown symbol "${cmd.symbol}"`,
        };
      }

      deps.eqWorkspace.intents.select(cmd.symbol);
      return { command: cmd, status: "applied" };
    }

    case "eqTimeframe":
      deps.eqWorkspace.intents.setTimeframe(cmd.tf);
      return { command: cmd, status: "applied" };

    case "eqChartType":
      deps.eqWorkspace.intents.setChartType(cmd.chart);
      return { command: cmd, status: "applied" };

    case "eqIndicator": {
      const current = readNow(deps.eqWorkspace.state$, FALLBACK_EQ_STATE);

      if (current.indicators.includes(cmd.id) === cmd.on) {
        return { command: cmd, status: "skipped", reason: "already set" };
      }

      deps.eqWorkspace.intents.toggleIndicator(cmd.id);
      return { command: cmd, status: "applied" };
    }

    case "eqPane": {
      const current = readNow(deps.eqWorkspace.state$, FALLBACK_EQ_STATE);

      if (current.panes.includes(cmd.id) === cmd.on) {
        return { command: cmd, status: "skipped", reason: "already set" };
      }

      deps.eqWorkspace.intents.togglePane(cmd.id);
      return { command: cmd, status: "applied" };
    }

    case "setTheme":
      deps.setThemeSkin(cmd.skin);
      return { command: cmd, status: "applied" };

    case "setPowerSaver":
      deps.setPowerSaver(cmd.level);
      return { command: cmd, status: "applied" };

    case "dismissPanel":
      deps.dismissPanel(cmd.panelId);
      return { command: cmd, status: "applied" };

    default:
      return {
        command: cmd,
        status: "skipped",
        reason: "unknown command kind",
      };
  }
}

function staggerMsFor(level: PowerSaverLevel): number {
  return level === "freeze" ? 0 : DRIVE_STAGGER_MS;
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
 * `timer` per command).
 *
 * `state.lastBatch` resets to `[]` at the start of each new batch (a
 * synchronous `concat`-prepended patch, before that batch's first staggered
 * command lands) and then grows one entry per applied/skipped command, so a
 * consumer watching `state$` mid-batch sees it fill in step by step —
 * exactly what the UI's driven-pulse cue (a later task) animates against.
 */
export function createJarvisDriverMachine(
  deps: JarvisDriverDeps,
): JarvisDriverMachineHandle {
  const patches$: Observable<Patch> = deps.events$.pipe(
    filter(isCommandEvent),
    concatMap((event) => {
      const resetPatch$: Observable<Patch> = of((): JarvisDriverState => {
        return { lastBatch: [] };
      });

      const commandPatches$: Observable<Patch> = from(
        event.batch.commands,
      ).pipe(
        concatMap((cmd) => {
          const staggerMs = staggerMsFor(readNow(deps.powerSaverLevel$, "off"));

          return timer(staggerMs, deps.scheduler).pipe(
            map((): Patch => {
              const outcome = applyCommand(cmd, deps);

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
  state$.subscribe();

  return { state$ };
}
