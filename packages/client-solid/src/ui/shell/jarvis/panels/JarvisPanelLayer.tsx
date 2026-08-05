import type { Accessor, JSX } from "solid-js";
import { createMemo, For, Match, Show, Switch } from "solid-js";

import type { JarvisPanelVm, PanelData } from "@rtc/client-core";
import { useViewModel } from "@rtc/solid-bindings";

import { PanelGauge, type PanelGaugeProps } from "./PanelGauge";
import { PanelHeatmap, type PanelHeatmapProps } from "./PanelHeatmap";
import { PanelLine, type PanelLineProps } from "./PanelLine";
import { PanelSparkGrid, type PanelSparkGridProps } from "./PanelSparkGrid";
import { PanelTable, type PanelTableProps } from "./PanelTable";

import styles from "./JarvisPanelLayer.module.css";

/**
 * Fixed top-right cascade stack for J.A.R.V.I.S.'s generative-UI desk panels
 * (docs/architecture/18-jarvis-ai-agent-surface.md). Mounted as `JarvisOverlay`'s
 * SIBLING in App.tsx, not its child: panels keep rendering (and their own
 * `data$` keeps ticking) whether the chat overlay is open or closed.
 *
 * Chrome (title/rationale/dismiss/testids) reads only `useJarvisPanels()` —
 * the list that changes on spawn/dismiss/edit. Each panel's BODY reads its
 * own `useJarvisPanelData(panelId)` independently (a keyed `state()` in
 * solid-bindings mirroring `useCandles`/`useDepth`), so one panel's tick
 * cadence never re-renders its siblings or the chrome list itself.
 *
 * `panels$` re-maps a FRESH `JarvisPanelVm[]` on every machine-state
 * emission (spawn/dismiss/edit of ANY panel), so a naive `<For each={panels()}>`
 * would remount every card on every list change, not just the affected one
 * (Solid's `<For>` diffs by item identity). The id-then-lookup pattern below
 * (`panelIds()` — an array of stable `panelId` strings — feeding `<For>`,
 * with the live VM looked up per id) is the Solid analogue of React's
 * `key={panel.panelId}`: `<For>` only mounts/unmounts a card when its id
 * genuinely enters/leaves the list. The inner `<Show>` is deliberately
 * NON-keyed (an Accessor, not `keyed`) so `JarvisPanelCard` receives a LIVE
 * `panel` accessor rather than a frozen snapshot — an unrelated panel's
 * lifecycle event updates props in place instead of remounting this card
 * (which would otherwise replay its entrance animation or interrupt an
 * in-flight dismiss).
 */
export function JarvisPanelLayer(): JSX.Element {
  const { useJarvisPanels } = useViewModel();
  const { panels, dismissPanel } = useJarvisPanels();

  const panelIds = createMemo((): string[] => {
    return panels().map((panel) => {
      return panel.panelId;
    });
  });

  return (
    <Show when={panels().length > 0}>
      <div data-testid="jarvis-panel-layer" class={styles.layer}>
        <For each={panelIds()}>
          {(panelId: string): JSX.Element => {
            const panel = createMemo((): JarvisPanelVm | undefined => {
              return panels().find((p) => {
                return p.panelId === panelId;
              });
            });

            return (
              <Show when={panel()}>
                {(currentPanel: Accessor<JarvisPanelVm>): JSX.Element => {
                  return (
                    <JarvisPanelCard
                      panel={currentPanel}
                      onDismiss={dismissPanel}
                    />
                  );
                }}
              </Show>
            );
          }}
        </For>
      </div>
    </Show>
  );
}

interface JarvisPanelCardProps {
  panel: Accessor<JarvisPanelVm>;
  onDismiss: (panelId: string) => void;
}

function JarvisPanelCard(props: JarvisPanelCardProps): JSX.Element {
  const { useJarvisPanelData, usePowerSaver } = useViewModel();
  // eslint-disable-next-line solid/reactivity -- setup-scope read is correct: this card's panelId is fixed for its whole lifetime (the parent's id-then-lookup <For>/<Show> only ever mounts one JarvisPanelCard per id — see JarvisPanelLayer's doc comment).
  const data = useJarvisPanelData(props.panel().panelId);
  const { isFreeze } = usePowerSaver();
  let rootRef: HTMLDivElement | undefined;

  // Dismiss = one transform+opacity WAAPI transition, played through the raw
  // `Element.animate` (mirroring useFlipGrid.ts's own established
  // convention in this client — solid-motionone isn't wired up, so there is
  // no "single sanctioned wrapper" import site here the way react's
  // animateOnce is), THEN the real intent fires — so the panel is already
  // invisible by the time it leaves useJarvisPanels()'s list and this
  // component unmounts. Skipped outright under freeze/reduced-motion
  // (mirrors useFlipGrid's exit-ghost gating) — no setTimeout anywhere, per
  // the src/ui timers gate.
  async function dismissThisPanel(): Promise<void> {
    const el = rootRef;

    if (
      el &&
      !isFreeze() &&
      !prefersReducedMotion() &&
      typeof el.animate === "function"
    ) {
      await el.animate(
        [
          { opacity: 1, transform: "translateY(0) scale(1)" },
          { opacity: 0, transform: "translateY(-8px) scale(0.96)" },
        ],
        { duration: DISMISS_DURATION_MS, easing: "ease" },
      ).finished;
    }

    props.onDismiss(props.panel().panelId);
  }

  return (
    <div
      ref={rootRef}
      data-testid="jarvis-panel"
      data-panel-id={props.panel().panelId}
      data-status={props.panel().status}
      class={styles.panel}
      title={props.panel().rationale ?? undefined}
    >
      <div class={styles.head}>
        <span class={styles.title}>{props.panel().title}</span>
        <button
          type="button"
          data-testid="jarvis-panel-dismiss"
          aria-label={`Dismiss ${props.panel().title}`}
          class={styles.dismiss}
          onClick={dismissThisPanel}
        >
          ✕
        </button>
      </div>
      {/* Keyed by the resolved viz kind (falling back to a stable sentinel
          while unresolved/unsupported) so a spec EDIT that swaps viz kind
          remounts the body — a plain CSS crossfade (one-shot fade-in,
          gated in the freeze/reduced-motion blocks below), no FLIP: the
          panel's own box doesn't move on a viz swap, only its contents. */}
      <Show when={data()?.kind ?? props.panel().status} keyed>
        {(_bodyKey: string): JSX.Element => {
          return (
            <div class={styles.body}>
              <JarvisPanelBody panel={props.panel} data={data()} />
            </div>
          );
        }}
      </Show>
    </div>
  );
}

interface JarvisPanelBodyProps {
  panel: Accessor<JarvisPanelVm>;
  data: PanelData | null;
}

function JarvisPanelBody(props: JarvisPanelBodyProps): JSX.Element {
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

function prefersReducedMotion(): boolean {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

const DISMISS_DURATION_MS = 180;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
