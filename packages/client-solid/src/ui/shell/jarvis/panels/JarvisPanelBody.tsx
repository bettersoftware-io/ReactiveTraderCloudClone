import type { Accessor, JSX } from "solid-js";
import { createMemo, Match, Switch } from "solid-js";

import type { JarvisPanelVm, PanelData } from "@rtc/client-core";

import { PanelGauge, type PanelGaugeProps } from "./PanelGauge";
import { PanelHeatmap, type PanelHeatmapProps } from "./PanelHeatmap";
import { PanelLine, type PanelLineProps } from "./PanelLine";
import { PanelSparkGrid, type PanelSparkGridProps } from "./PanelSparkGrid";
import { PanelTable, type PanelTableProps } from "./PanelTable";

import styles from "./JarvisPanelLayer.module.css";

/**
 * The unsupported/pending/per-viz-kind switch shared by every desk-panel
 * chrome: `JarvisPanelLayer`'s floating `JarvisPanelCard` and
 * `JarvisDockedPanelBody` (a docked panel's leaf inside the workspace
 * engine) both render this same component, so a spec edit ("make it a
 * table") restyles a panel identically whether it's floating or docked.
 * Extracted to its own file (rather than staying local to
 * `JarvisPanelLayer.tsx`) so both callers can import it without that file
 * exporting a second component (`rtc/component-newspaper`).
 */
export function JarvisPanelBody(props: JarvisPanelBodyProps): JSX.Element {
  // Narrows `props.data | null` to each variant, reactively — Match's keyed
  // render-prop form below hands the narrowed props straight to the leaf
  // renderer via `{...data()}` (a JSX spread, which Solid compiles to a lazy
  // getter — see PanelLine.tsx's sibling components for why a PLAIN function
  // call snapshotting `data()` outside a JSX position would freeze on the
  // first tick instead).
  const lineData = createMemo((): PanelLineProps | undefined => {
    const d = props.data;
    return d && d.kind === "line" ? d : undefined;
  });

  const tableData = createMemo((): PanelTableProps | undefined => {
    const d = props.data;
    return d && d.kind === "table" ? d : undefined;
  });

  const gaugeData = createMemo((): PanelGaugeProps | undefined => {
    const d = props.data;
    return d && d.kind === "gauge" ? d : undefined;
  });

  const sparkGridData = createMemo((): PanelSparkGridProps | undefined => {
    const d = props.data;
    return d && d.kind === "sparkGrid" ? d : undefined;
  });

  const heatmapData = createMemo((): PanelHeatmapProps | undefined => {
    const d = props.data;
    return d && d.kind === "heatmap" ? d : undefined;
  });

  return (
    <Switch fallback={<div class={styles.pending}>Connecting…</div>}>
      <Match when={props.panel().status === "unsupported"}>
        <div data-testid="jarvis-panel-unsupported" class={styles.unsupported}>
          <div class={styles.unsupportedTitle}>UNSUPPORTED PANEL</div>
          <div class={styles.unsupportedText}>
            This build has no renderer for what J.A.R.V.I.S proposed.
          </div>
        </div>
      </Match>
      <Match when={lineData()}>
        {(data: Accessor<PanelLineProps>): JSX.Element => {
          return <PanelLine {...data()} />;
        }}
      </Match>
      <Match when={tableData()}>
        {(data: Accessor<PanelTableProps>): JSX.Element => {
          return <PanelTable {...data()} />;
        }}
      </Match>
      <Match when={gaugeData()}>
        {(data: Accessor<PanelGaugeProps>): JSX.Element => {
          return <PanelGauge {...data()} />;
        }}
      </Match>
      <Match when={sparkGridData()}>
        {(data: Accessor<PanelSparkGridProps>): JSX.Element => {
          return <PanelSparkGrid {...data()} />;
        }}
      </Match>
      <Match when={heatmapData()}>
        {(data: Accessor<PanelHeatmapProps>): JSX.Element => {
          return <PanelHeatmap {...data()} />;
        }}
      </Match>
    </Switch>
  );
}

interface JarvisPanelBodyProps {
  panel: Accessor<JarvisPanelVm>;
  data: PanelData | null;
}
