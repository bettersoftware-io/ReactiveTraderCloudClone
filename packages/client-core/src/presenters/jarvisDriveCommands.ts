/**
 * The Jarvis driver's command interpreter, free of any stream library: what
 * one `DriveCommandV1` does to the app and the `DriveOutcome` it reports,
 * plus the stagger between a batch's commands. The RxJS
 * `createJarvisDriverMachine` is a shell over it (the batch queue and the
 * timers), and the alternative application cores import it rather than
 * re-implementing it (pluggable-core slice 7 wave 2, ruling 2).
 */
import type {
  DriveOutcome,
  EqWorkspaceIntents,
  EqWorkspaceState,
  LayoutIntents,
  LayoutState,
  Machine,
  WorkspaceTab,
} from "@rtc/core-api";
import {
  DRIVE_STAGGER_MS,
  MAX_DOCKED_PANELS,
  type PowerSaverLevel,
  type ThemeSkin,
} from "@rtc/domain";
import type { DriveCommandV1 } from "@rtc/shared";

/** Everything a command touches, read and written SYNCHRONOUSLY — each core
 * adapts its own streams to these readers. See `JarvisDriverDeps`'s doc
 * (`./JarvisDriverMachine`) for what each one is wired to. */
export interface DriveCommandDeps {
  /** `workspaceNav`'s `switchTab` intent. */
  readonly switchTab: (tab: WorkspaceTab) => void;
  /** The per-tab layout machine SINGLETON — the instance the UI reads. */
  readonly layout: (tab: WorkspaceTab) => Machine<LayoutState, LayoutIntents>;
  /** The equities workspace singleton's intents. */
  readonly eqWorkspace: EqWorkspaceIntents;
  /** Its current state, or `undefined` before it has one (the interpreter
   * then reads a default workspace). */
  readonly eqWorkspaceState: () => EqWorkspaceState | undefined;
  readonly setThemeSkin: (skin: ThemeSkin) => void;
  readonly setPowerSaver: (level: PowerSaverLevel) => void;
  readonly dismissPanel: (panelId: string) => void;
  /** Docks the panel; `false` when the workspace refused it (an id
   * colliding with a workspace panel id — see `WorkspaceDock.dockPanel`). */
  readonly dockPanel: (panelId: string) => boolean;
  readonly undockPanel: (panelId: string) => void;
  /** The static panel ids in `tab`'s default layout tree. */
  readonly knownLayoutPanelIds: (tab: WorkspaceTab) => readonly string[];
  /** The panels in `tab` currently floating or popped out. */
  readonly detachedPanelIds: (tab: WorkspaceTab) => readonly string[];
  /** Every live desk panel id, floating and docked. */
  readonly livePanelIds: () => readonly string[];
  /** Every docked desk panel id. */
  readonly dockedPanelIds: () => readonly string[];
  /** The watchlist's symbols, or `undefined` while it has not loaded. */
  readonly knownSymbols: () => readonly string[] | undefined;
}

/** How long to wait before applying the command at `index` of its batch:
 * the first fires at once (no dead pause before the desk visibly reacts),
 * every later one `DRIVE_STAGGER_MS` after the previous — 0 under
 * power-saver `"freeze"`, the motion-free guarantee. */
export function driveStaggerMs(index: number, level: PowerSaverLevel): number {
  return index === 0 || level === "freeze" ? 0 : DRIVE_STAGGER_MS;
}

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

// A named tag for the "layout" branch of DriveCommandV1:
// `Extract<DriveCommandV1, { readonly kind: "layout" }>` would take an inline
// object type as a type argument, which the repo's `no-restricted-syntax`
// bans.
interface LayoutCommandTag {
  readonly kind: "layout";
}
type LayoutCommand = Extract<DriveCommandV1, LayoutCommandTag>;

function applyLayoutCommand(
  cmd: LayoutCommand,
  deps: DriveCommandDeps,
): DriveOutcome {
  const dockedPanelIds = deps.dockedPanelIds();
  const known = [...deps.knownLayoutPanelIds(cmd.tab), ...dockedPanelIds];

  if (!known.includes(cmd.panelId)) {
    return {
      command: cmd,
      status: "skipped",
      reason: `unknown panelId "${cmd.panelId}" for tab "${cmd.tab}"`,
    };
  }

  if (
    cmd.op !== "restore" &&
    deps.detachedPanelIds(cmd.tab).includes(cmd.panelId)
  ) {
    return {
      command: cmd,
      status: "refused",
      reason: `${cmd.panelId} is floating or popped out — dock it first`,
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
  deps: DriveCommandDeps,
): DriveOutcome {
  switch (cmd.kind) {
    case "switchTab":
      deps.switchTab(cmd.tab);
      return { command: cmd, status: "applied" };

    case "layout":
      return applyLayoutCommand(cmd, deps);

    case "eqSelect": {
      const knownSymbols = deps.knownSymbols();

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

      deps.eqWorkspace.select(cmd.symbol);
      return { command: cmd, status: "applied" };
    }

    case "eqTimeframe":
      deps.eqWorkspace.setTimeframe(cmd.tf);
      return { command: cmd, status: "applied" };

    case "eqChartType":
      deps.eqWorkspace.setChartType(cmd.chart);
      return { command: cmd, status: "applied" };

    case "eqIndicator": {
      const current = deps.eqWorkspaceState() ?? FALLBACK_EQ_STATE;

      if (current.indicators.includes(cmd.id) === cmd.on) {
        return { command: cmd, status: "skipped", reason: "already set" };
      }

      deps.eqWorkspace.toggleIndicator(cmd.id);
      return { command: cmd, status: "applied" };
    }

    case "eqPane": {
      const current = deps.eqWorkspaceState() ?? FALLBACK_EQ_STATE;

      if (current.panes.includes(cmd.id) === cmd.on) {
        return { command: cmd, status: "skipped", reason: "already set" };
      }

      deps.eqWorkspace.togglePane(cmd.id);
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
      const livePanelIds = deps.livePanelIds();
      const dockedPanelIds = deps.dockedPanelIds();

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

      if (!deps.dockPanel(cmd.panelId)) {
        return {
          command: cmd,
          status: "refused",
          reason: `${cmd.panelId} collides with a workspace panel id`,
        };
      }

      return { command: cmd, status: "applied" };
    }

    case "undockPanel": {
      const dockedPanelIds = deps.dockedPanelIds();

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

/** `applyCommand`, guarded: an injected dep (any intent method, `setThemeSkin`,
 * `dismissPanel`, ...) is caller-supplied and can throw for reasons entirely
 * outside the driver's control — an uncaught throw would escape into the
 * calling core's fold and kill it for good (an RxJS stream cannot recover
 * from an error). Composition already guards the SOURCE of drive batches
 * for exactly this class of problem; this is the same doctrine applied to
 * the DISPATCH side, so a single bad command can't take the whole driver
 * down for every batch after it. Returns the outcome to report — a throw
 * becomes a `"skipped"` outcome carrying the error's message. */
export function applyDriveCommand(
  cmd: DriveCommandV1,
  deps: DriveCommandDeps,
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
