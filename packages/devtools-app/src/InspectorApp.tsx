import type { ReactElement } from "react";
import { useEffect, useRef } from "react";

import type {
  InspectorState,
  InspectorStore,
  LogRow,
} from "@rtc/devtools-core";
import { LiveHistory, projectSnapshot } from "@rtc/devtools-core";

import styles from "#/InspectorApp.module.css";
import type { NavNode } from "#/nav/buildNavTree";
import { buildNavTree } from "#/nav/buildNavTree";
import { NavTree } from "#/nav/NavTree";
import type { Scope } from "#/nav/scope";
import { ALL_SCOPE } from "#/nav/scope";
import type { NavigationModel } from "#/nav/useNavigation";
import { useNavigation } from "#/nav/useNavigation";
import { RecordingToolbar } from "#/recording/RecordingToolbar";
import { useRecording } from "#/recording/useRecording";
import { ContextPane } from "#/timeline/ContextPane";
import { TimelinePane } from "#/timeline/TimelinePane";
import { logAfterSeq, seqOfMachineIntent } from "#/timeline/timelineModel";
import { useTimeline } from "#/timeline/useTimeline";
import { useInspectorState } from "#/useInspectorState";

/** The devtools panel shell (spec §3): a rail holding the connection badge
 * and the navigation tree, beside a main column of recording toolbar and
 * the scoped split — actions list | context pane. One selection (the
 * scope) drives everything: the tree owns it, `useTimeline` compiles it
 * into a filter, the context pane narrows State to it. Importing a
 * recording swaps the datasource wholesale (log, history, present state)
 * and resets the scope, pin and radius. */
export function InspectorApp({
  store,
  onInvokeIntent,
}: InspectorAppProps): ReactElement {
  const liveState = useInspectorState(store);

  // Build-exactly-once instance, NOT a cache. Its identity is observed twice —
  // it is a dependency of the store-tap effect below, and `seededHistoryRef` is
  // keyed on it — so a fresh instance per render would re-tap the store every
  // render. A ref guarantees single construction even under StrictMode's
  // double-render; `useMemo` never did (React may discard a memo cache).
  const liveHistoryRef = useRef<LiveHistory | null>(null);

  if (liveHistoryRef.current === null) {
    liveHistoryRef.current = new LiveHistory();
  }

  const liveHistory = liveHistoryRef.current;

  // Seeds `liveHistory` with whatever the store already holds before the tap
  // attaches, so messages applied before this effect mounts (e.g. an already
  // up InspectorStore reused across a remount) aren't invisible to
  // stateAt(). Guarded by a ref, not just the effect's own once-per-pair
  // body, because StrictMode double-invokes effects — without the guard a
  // second seed would insert a duplicate snapshot frame into history.
  const seededHistoryRef = useRef<LiveHistory | null>(null);

  useEffect((): (() => void) => {
    if (seededHistoryRef.current !== liveHistory) {
      liveHistory.record(projectSnapshot(store.getSnapshot()));
      seededHistoryRef.current = liveHistory;
    }

    return store.tap((msg) => {
      liveHistory.record(msg);
    });
  }, [store, liveHistory]);

  const recording = useRecording(store, liveHistory, liveState.appId);

  const activeLog = recording.imported?.state.log ?? liveState.log;
  const activeHistory = recording.imported?.history ?? liveHistory;
  const presentState = recording.imported?.state ?? liveState;

  const navigation = useNavigation();
  const timeline = useTimeline(
    activeLog,
    activeHistory,
    navigation.scope,
    presentState,
  );
  const visibleLog = logAfterSeq(activeLog, timeline.filter.clearedBeforeSeq);
  const navTree = buildNavTree(presentState, visibleLog);

  // Swapping the datasource (an import lands, or Back to live restores the
  // live seam) is a new timeline: drop the pin, radius and scope left over
  // from the previous datasource rather than let them silently survive the
  // swap. The ref comparison — not just the dependency array — is what keeps
  // this from firing on every render: `timeline` and `navigation` are fresh
  // objects every render, so a dependency array naming them would either
  // refire constantly or trip the exhaustive-deps lint. Comparing against the
  // previous `activeHistory` inside the effect body makes the real condition
  // explicit. Firing on first mount too is harmless: a fresh timeline already
  // starts in "follow" with no radius, on the All scope.
  const previousHistoryRef = useRef<LiveHistory | null>(null);

  useEffect((): void => {
    if (previousHistoryRef.current !== activeHistory) {
      previousHistoryRef.current = activeHistory;
      timeline.resume();
      timeline.clearRadius();
      timeline.unclear();
      navigation.select(ALL_SCOPE);
    }
  }, [activeHistory, timeline, navigation]);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  function probeWireAroundRow(row: LogRow): void {
    navigation.pushScope(ALL_SCOPE);
    timeline.pin(row);
    timeline.setRadiusAround(row);
  }

  function showPinnedInAll(): void {
    navigation.select(ALL_SCOPE);
  }

  function pinTimelineAtIntent(
    machineId: string,
    name: string,
    ts: number,
  ): void {
    const seq = seqOfMachineIntent(activeLog, machineId, name, ts);
    const row =
      seq === null
        ? undefined
        : activeLog.find((r) => {
            return r.seq === seq;
          });

    if (row !== undefined) {
      timeline.pin(row);
    }
  }

  function escapeTimeline(): void {
    // Precedence 1 (spec §3.1) is signalled by an active radius, not by a
    // scope change: `pushScope` records no history when the wire probe's
    // target scope equals the current one (probing from All, the default),
    // so gating on `popScope()`'s return left the radius stranded — the
    // pinned bar disappeared while the list stayed radius-filtered with no
    // way back short of the `±100ms ✕` chip. `popScope()` here is
    // best-effort: it restores the previous scope when there is one, and is
    // a harmless no-op when the probe started from All.
    if (timeline.filter.radius !== null) {
      navigation.popScope();
      timeline.clearRadius();

      return;
    }

    if (timeline.selection.mode === "pinned") {
      timeline.resume();

      return;
    }

    if (!timeline.tailAttached) {
      timeline.setTailAttached(true);
    }
  }

  function focusScopeSearch(): void {
    searchInputRef.current?.focus();
  }

  useWindowShortcuts({
    stepPrev: timeline.selectPrev,
    stepNext: timeline.selectNext,
    escape: escapeTimeline,
    clear: timeline.clear,
    focusSearch: focusScopeSearch,
  });

  return (
    <div className={styles.app}>
      <ConnectionRail
        state={presentState}
        nodes={navTree}
        navigation={navigation}
      />
      <div className={styles.main}>
        <RecordingToolbar model={recording} />
        <div className={styles.split}>
          <TimelinePane
            model={timeline}
            scope={navigation.scope}
            searchInputRef={searchInputRef}
            onProbeWire={probeWireAroundRow}
            onShowInAll={showPinnedInAll}
          />
          <ContextPane
            model={timeline}
            log={activeLog}
            presentState={presentState}
            scope={navigation.scope}
            dev={presentState.dev}
            onInvokeIntent={onInvokeIntent}
            onPinIntent={pinTimelineAtIntent}
          />
        </div>
      </div>
    </div>
  );
}

export interface InspectorAppProps {
  store: InspectorStore;
  onInvokeIntent?: (
    machineId: string,
    name: string,
    args: readonly unknown[],
  ) => void;
}

interface Shortcuts {
  stepPrev: () => void;
  stepNext: () => void;
  escape: () => void;
  clear: () => void;
  focusSearch: () => void;
}

/** The keys `NavTree` handles itself while a node button has focus (see its
 * own keydown handler): arrow-key cursor movement and Enter-to-select. Every
 * other shortcut — `/`, `c`, `Escape` — stays global even with the tree
 * focused, so this router must swallow only these five, never a blanket
 * "target inside the tree". */
const TREE_KEYS: ReadonlySet<string> = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
]);

/** One window `keydown` listener for the life of the app (not one per
 * render — the STATUS "re-binds per render" item). The latest handlers
 * live in a ref the listener reads at dispatch time. Routing by focus:
 * inside an input/textarea only Escape acts (blur); inside the tree
 * (`[data-nav-tree]`) only the tree's own keys (`TREE_KEYS`) are swallowed —
 * `/`, `c` and `Escape` stay global even with a node focused (amended §3.1;
 * see docs/architecture/20-devtools.md §20.12). */
function useWindowShortcuts(shortcuts: Shortcuts): void {
  const shortcutsRef = useRef(shortcuts);

  shortcutsRef.current = shortcuts;

  useEffect((): (() => void) => {
    function dispatchInspectorShortcut(e: KeyboardEvent): void {
      // A held modifier means the keystroke belongs to the browser or the
      // OS, never to us. `e.key` is plain `"c"` for BOTH `c` and ⌘C/Ctrl+C,
      // and copying a value out of the panel is its core gesture — a text
      // selection leaves focus on `<body>` or a row, not an input, so
      // without this guard ⌘C would silently Clear the timeline. Same for
      // ⌘↑ ("scroll to top"), which must not be preventDefault-ed.
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      // Narrowed, not cast: a shortcut typed with nothing focused is
      // dispatched at `window` itself, which has neither `tagName` nor
      // `closest` — a cast makes that the app-wide crash path.
      const target = e.target instanceof Element ? e.target : null;
      const current = shortcutsRef.current;

      if (
        target !== null &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        if (e.key === "Escape" && target instanceof HTMLElement) {
          target.blur();
        }

        return;
      }

      if (
        target !== null &&
        target.closest("[data-nav-tree]") !== null &&
        TREE_KEYS.has(e.key)
      ) {
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        current.stepPrev();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        current.stepNext();
      } else if (e.key === "Escape") {
        current.escape();
      } else if (e.key === "/") {
        e.preventDefault();
        current.focusSearch();
      } else if (e.key === "c") {
        current.clear();
      }
    }

    window.addEventListener("keydown", dispatchInspectorShortcut);

    return (): void => {
      window.removeEventListener("keydown", dispatchInspectorShortcut);
    };
  }, []);
}

interface ConnectionRailProps {
  state: InspectorState;
  nodes: readonly NavNode[];
  navigation: NavigationModel;
}

function ConnectionRail({
  state,
  nodes,
  navigation,
}: ConnectionRailProps): ReactElement {
  function selectScope(scope: Scope): void {
    navigation.select(scope);
  }

  return (
    <aside className={styles.rail}>
      <div className={styles.railHeader}>
        <span
          className={
            state.connected ? styles.dotConnected : styles.dotDisconnected
          }
          aria-hidden="true"
        />
        <span data-testid="connection-badge" className={styles.appId}>
          {state.connected ? state.appId : "disconnected"}
        </span>
      </div>
      {state.protocolMismatch !== null ? (
        <p className={styles.mismatch}>
          Protocol mismatch: app v{state.protocolMismatch}
        </p>
      ) : null}
      <NavTree nodes={nodes} scope={navigation.scope} onSelect={selectScope} />
    </aside>
  );
}
