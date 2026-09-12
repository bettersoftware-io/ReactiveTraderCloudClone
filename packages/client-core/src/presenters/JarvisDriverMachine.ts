import { type StateObservable, state } from "@rx-state/core";
import { concat, from, type Observable, of, Subject, timer } from "rxjs";
import { concatMap, filter, map, scan, take } from "rxjs/operators";

import type {
  DriveOutcome,
  JarvisDriverDeps,
  JarvisDriverMachineHandle,
  JarvisDriverState,
} from "@rtc/core-api";
import type { PowerSaverLevel } from "@rtc/domain";
import type { DriveCommandV1 } from "@rtc/shared";

import type { JarvisEvent } from "#/adapters/jarvisPort";

import type { EqWorkspaceState } from "./EqWorkspaceMachine";
import { MAX_DOCKED_PANELS } from "./JarvisPanelsMachine";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type {
  DriveOutcome,
  JarvisDriverDeps,
  JarvisDriverMachineHandle,
  JarvisDriverState,
};

/** How far apart (ms) each command after the first, within one batch, is
 * applied — the visible "step by step" choreography. The batch's own FIRST
 * command always fires immediately (no dead pause before the desk visibly
 * reacts to a drive turn); this constant governs the gap BETWEEN commands
 * only. Collapses to 0 under power-saver `"freeze"` (read fresh per command
 * from `powerSaverLevel$`), per the motion-free guarantee
 * `docs/performance.md`/`docs/power-saver-mode.md` demand. */
export const DRIVE_STAGGER_MS = 350;

const INITIAL_STATE: JarvisDriverState = { lastBatch: [] };

const FALLBACK_EQ_STATE: EqWorkspaceState = {
  sel: "",
  openTabs: [],
  timeframe: "1D",
  chartType: "candles",
  indicators: [],
  panes: [],
  yScale: "linear",
  compare: null,
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

function applyLayoutCommand(
  cmd: LayoutCommand,
  deps: JarvisDriverDeps,
): DriveOutcome {
  const dockedPanelIds = readNow(deps.dockedPanelIds$, []);
  const known = [...deps.knownLayoutPanelIds(cmd.tab), ...dockedPanelIds];

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
      const knownSymbols = readLatest(deps.knownSymbols$);

      if (knownSymbols === undefined) {
        return {
          command: cmd,
          status: "skipped",
          reason: "watchlist not loaded",
        };
      }

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

    case "dockPanel": {
      const livePanelIds = readNow(deps.livePanelIds$, []);
      const dockedPanelIds = readNow(deps.dockedPanelIds$, []);

      if (!livePanelIds.includes(cmd.panelId)) {
        return {
          command: cmd,
          status: "skipped",
          reason: `unknown panelId "${cmd.panelId}"`,
        };
      }

      if (dockedPanelIds.includes(cmd.panelId)) {
        return { command: cmd, status: "skipped", reason: "already docked" };
      }

      if (dockedPanelIds.length >= MAX_DOCKED_PANELS) {
        return { command: cmd, status: "skipped", reason: "dock full" };
      }

      deps.dockPanel(cmd.panelId);
      return { command: cmd, status: "applied" };
    }

    case "undockPanel": {
      const dockedPanelIds = readNow(deps.dockedPanelIds$, []);

      if (!dockedPanelIds.includes(cmd.panelId)) {
        return { command: cmd, status: "skipped", reason: "not docked" };
      }

      deps.undockPanel(cmd.panelId);
      return { command: cmd, status: "applied" };
    }

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

/** `applyCommand`, guarded: an injected dep (any intent method, `setThemeSkin`,
 * `dismissPanel`, ...) is caller-supplied and can throw for reasons entirely
 * outside this machine's control — an uncaught throw here would propagate
 * out of the `map()` callback below and error `state$` PERMANENTLY (RxJS: an
 * error terminates a stream; there is no recovering it). Composition already
 * guards the SOURCE (`catchError(() => EMPTY)` on `events$`) for exactly
 * this class of problem; this is the same doctrine applied to the
 * DISPATCH side, so a single bad command can't take the whole driver down
 * for every batch after it. */
function safeApplyCommand(
  cmd: DriveCommandV1,
  deps: JarvisDriverDeps,
): DriveOutcome {
  try {
    return applyCommand(cmd, deps);
  } catch (err) {
    return {
      command: cmd,
      status: "skipped",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
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
          const staggerMs =
            index === 0
              ? 0
              : staggerMsFor(readNow(deps.powerSaverLevel$, "off"));

          return timer(staggerMs, deps.scheduler).pipe(
            map((): Patch => {
              const outcome = safeApplyCommand(cmd, deps);
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
