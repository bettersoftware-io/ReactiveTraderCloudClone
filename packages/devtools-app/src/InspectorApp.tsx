import type { ReactElement, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { InspectorState, InspectorStore } from "@rtc/devtools-core";
import { LiveHistory, projectSnapshot } from "@rtc/devtools-core";

import styles from "#/InspectorApp.module.css";
import { MachinesPanel } from "#/panels/MachinesPanel";
import { WirePanel } from "#/panels/WirePanel";
import { RecordingToolbar } from "#/recording/RecordingToolbar";
import { useRecording } from "#/recording/useRecording";
import { ContextPane } from "#/timeline/ContextPane";
import { FilterControls } from "#/timeline/FilterControls";
import { TimelinePane } from "#/timeline/TimelinePane";
import { seqOfMachineIntent } from "#/timeline/timelineModel";
import type { TimelineModel } from "#/timeline/useTimeline";
import { useTimeline } from "#/timeline/useTimeline";
import { useInspectorState } from "#/useInspectorState";

/** The devtools panel shell: connection rail (badge + counts + filters) beside
 * a main column of recording toolbar, lens switcher, and the active lens.
 * Timeline is the default lens — a single chronological feed across every
 * event family with a pinned-moment context pane (spec §3); Machines and
 * Wire are the same panels as before, now cross-linked back into the
 * timeline. Importing a recording (RecordingToolbar) swaps the datasource:
 * both the log the timeline renders and the history it reconstructs through
 * become the import's, and "present" becomes the import's own final fold so
 * ≠-live marks compare against the recording's end state, never the live
 * app. */
export function InspectorApp({
  store,
  onInvokeIntent,
}: InspectorAppProps): ReactElement {
  const liveState = useInspectorState(store);
  const liveHistory = useMemo((): LiveHistory => {
    return new LiveHistory();
  }, []);

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

  const timeline = useTimeline(activeLog, activeHistory);

  // Swapping the datasource (an import lands, or Back to live restores the
  // live seam) is a new timeline: drop any pin and radius filter left over
  // from the previous datasource rather than let them silently survive the
  // swap. The ref comparison — not just the dependency array — is what keeps
  // this from firing on every render: `timeline` is a fresh object every
  // render, so a dependency array naming it (or its still-stable resume/
  // clearRadius members without a body reference) would either refire
  // constantly or trip the exhaustive-deps lint. Comparing against the
  // previous `activeHistory` inside the effect body makes the real
  // condition explicit. Firing on first mount too is harmless: a fresh
  // timeline already starts in "follow" with no radius.
  const previousHistoryRef = useRef<LiveHistory | null>(null);

  useEffect((): void => {
    if (previousHistoryRef.current !== activeHistory) {
      previousHistoryRef.current = activeHistory;
      timeline.resume();
      timeline.clearRadius();
    }
  }, [activeHistory, timeline]);

  const [lens, setLens] = useState<InspectorLens>("timeline");
  const filterInputRef = useRef<HTMLInputElement | null>(null);

  useEffect((): (() => void) => {
    function onKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;

      if (
        target !== null &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        if (e.key === "Escape") {
          target.blur();
        }

        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        timeline.selectPrev();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        timeline.selectNext();
      } else if (e.key === "Escape") {
        timeline.resume();
      } else if (e.key === "/") {
        e.preventDefault();
        filterInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return (): void => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [timeline]);

  const handleFocusInTimeline = useCallback(
    (machineId: string): void => {
      timeline.addPill({ type: "machine", id: machineId });
      setLens("timeline");
    },
    [timeline],
  );

  const handlePinIntent = useCallback(
    (machineId: string, name: string, ts: number): void => {
      const seq = seqOfMachineIntent(activeLog, machineId, name, ts);

      if (seq !== null) {
        timeline.pin(seq);
        setLens("timeline");
      }
    },
    [activeLog, timeline],
  );

  const handleMsgTypePill = useCallback(
    (msgType: string): void => {
      timeline.addPill({ type: "msgType", id: msgType });
      setLens("timeline");
    },
    [timeline],
  );

  return (
    <div className={styles.app}>
      <ConnectionRail
        state={presentState}
        timeline={timeline}
        textInputRef={filterInputRef}
      />
      <div className={styles.main}>
        <RecordingToolbar model={recording} />
        <LensStrip active={lens} onSelect={setLens} />
        {lens === "timeline" ? (
          <div className={styles.split}>
            <TimelinePane model={timeline} />
            <ContextPane
              model={timeline}
              log={activeLog}
              presentState={presentState}
            />
          </div>
        ) : null}
        {lens === "machines" ? (
          <div className={styles.panel}>
            <MachinesPanel
              machines={presentState.machines}
              dev={presentState.dev}
              onInvokeIntent={onInvokeIntent}
              onFocusInTimeline={handleFocusInTimeline}
              onPinIntent={handlePinIntent}
            />
          </div>
        ) : null}
        {lens === "wire" ? (
          <div className={styles.panel}>
            <WirePanel log={activeLog} onMsgTypePill={handleMsgTypePill} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

type InspectorLens = "timeline" | "machines" | "wire";

export interface InspectorAppProps {
  store: InspectorStore;
  onInvokeIntent?: (
    machineId: string,
    name: string,
    args: readonly unknown[],
  ) => void;
}

interface ConnectionRailProps {
  state: InspectorState;
  timeline: TimelineModel;
  textInputRef: RefObject<HTMLInputElement | null>;
}

function ConnectionRail({
  state,
  timeline,
  textInputRef,
}: ConnectionRailProps): ReactElement {
  const wireCount = state.log.filter((row) => {
    return row.kind === "wire:in" || row.kind === "wire:out";
  }).length;

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
      <dl className={styles.counts}>
        <RailCount label="Streams" value={state.streams.length} />
        <RailCount label="Machines" value={state.machines.length} />
        <RailCount label="Log" value={state.log.length} />
        <RailCount label="Wire" value={wireCount} />
      </dl>
      <FilterControls model={timeline} textInputRef={textInputRef} />
    </aside>
  );
}

interface RailCountProps {
  label: string;
  value: number;
}

function RailCount({ label, value }: RailCountProps): ReactElement {
  return (
    <div className={styles.count}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

interface LensStripProps {
  active: InspectorLens;
  onSelect: (lens: InspectorLens) => void;
}

interface LensDescriptor {
  id: InspectorLens;
  label: string;
}

const LENSES: readonly LensDescriptor[] = [
  { id: "timeline", label: "Timeline" },
  { id: "machines", label: "Machines" },
  { id: "wire", label: "Wire" },
];

function LensStrip({ active, onSelect }: LensStripProps): ReactElement {
  return (
    <nav className={styles.lensStrip}>
      {LENSES.map((entry) => {
        return (
          <LensButton
            key={entry.id}
            id={entry.id}
            label={entry.label}
            active={active}
            onSelect={onSelect}
          />
        );
      })}
    </nav>
  );
}

interface LensButtonProps {
  id: InspectorLens;
  label: string;
  active: InspectorLens;
  onSelect: (lens: InspectorLens) => void;
}

function LensButton({
  id,
  label,
  active,
  onSelect,
}: LensButtonProps): ReactElement {
  function handleClick(): void {
    onSelect(id);
  }

  return (
    <button
      type="button"
      data-testid={`lens-${id}`}
      className={id === active ? styles.tabActive : styles.tab}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}
