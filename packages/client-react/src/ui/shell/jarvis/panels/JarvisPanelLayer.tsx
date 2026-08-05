import type { ReactElement } from "react";
import { useRef } from "react";

import type { JarvisPanelVm, PanelData } from "@rtc/client-core";
import { useViewModel } from "@rtc/react-bindings";

import { animateOnce } from "#/ui/shell/motion";

import { PanelGauge } from "./PanelGauge";
import { PanelHeatmap } from "./PanelHeatmap";
import { PanelLine } from "./PanelLine";
import { PanelSparkGrid } from "./PanelSparkGrid";
import { PanelTable } from "./PanelTable";

import styles from "./JarvisPanelLayer.module.css";

/**
 * Fixed top-right cascade stack for J.A.R.V.I.S.'s generative-UI desk panels
 * (docs/architecture/18-jarvis-ai-agent-surface.md). Mounted as `JarvisOverlay`'s
 * SIBLING in App.tsx, not its child: panels keep rendering (and their own
 * `data$` keeps ticking) whether the chat overlay is open or closed.
 *
 * Chrome (title/rationale/dismiss/testids) reads only `useJarvisPanels()` —
 * the list that changes on spawn/dismiss/edit. Each panel's BODY reads its
 * own `useJarvisPanelData(panelId)` independently (a keyed `bind()` in
 * react-bindings mirroring `useCandles`/`useDepth`), so one panel's tick
 * cadence never re-renders its siblings or the chrome list itself.
 */
export function JarvisPanelLayer(): ReactElement | null {
  const { useJarvisPanels } = useViewModel();
  const { panels, dismissPanel } = useJarvisPanels();

  if (panels.length === 0) {
    return null;
  }

  return (
    <div data-testid="jarvis-panel-layer" className={styles.layer}>
      {panels.map((panel) => {
        return (
          <JarvisPanelCard
            key={panel.panelId}
            panel={panel}
            onDismiss={dismissPanel}
          />
        );
      })}
    </div>
  );
}

interface JarvisPanelCardProps {
  panel: JarvisPanelVm;
  onDismiss: (panelId: string) => void;
}

function JarvisPanelCard({
  panel,
  onDismiss,
}: JarvisPanelCardProps): ReactElement {
  const { useJarvisPanelData, usePowerSaver } = useViewModel();
  const data = useJarvisPanelData(panel.panelId);
  const { isFreeze } = usePowerSaver();
  const rootRef = useRef<HTMLDivElement>(null);

  // Dismiss = one transform+opacity WAAPI transition, played through the
  // repo's single sanctioned Motion One wrapper (animateOnce), THEN the real
  // intent fires — so the panel is already invisible by the time it leaves
  // useJarvisPanels()'s list and this component unmounts. Skipped outright
  // under freeze/reduced-motion (mirrors useFlipGrid's exit-ghost gating) —
  // no timer calls anywhere, per the src/ui timers gate.
  //
  // Split into a sync `onClick` target + an async worker: a JSX event
  // handler prop must return `void`, so `@typescript-eslint/no-misused-promises`
  // rejects an `async` function passed straight to `onClick` (a dropped
  // rejection would otherwise fail silently).
  function dismissThisPanel(): void {
    void animateOutThenDismissPanel();
  }

  async function animateOutThenDismissPanel(): Promise<void> {
    const el = rootRef.current;

    if (el && !isFreeze && !prefersReducedMotion()) {
      await animateOnce(
        el,
        {
          opacity: [1, 0],
          transform: ["translateY(0) scale(1)", "translateY(-8px) scale(0.96)"],
        },
        { duration: DISMISS_DURATION_S, easing: "ease" },
      );
    }

    onDismiss(panel.panelId);
  }

  return (
    <div
      ref={rootRef}
      data-testid="jarvis-panel"
      data-panel-id={panel.panelId}
      data-status={panel.status}
      className={styles.panel}
      title={panel.rationale ?? undefined}
    >
      <div className={styles.head}>
        <span className={styles.title}>{panel.title}</span>
        <button
          type="button"
          data-testid="jarvis-panel-dismiss"
          aria-label={`Dismiss ${panel.title}`}
          className={styles.dismiss}
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
      <div className={styles.body} key={data?.kind ?? panel.status}>
        <JarvisPanelBody panel={panel} data={data} />
      </div>
    </div>
  );
}

interface JarvisPanelBodyProps {
  panel: JarvisPanelVm;
  data: PanelData | null;
}

function JarvisPanelBody({ panel, data }: JarvisPanelBodyProps): ReactElement {
  if (panel.status === "unsupported") {
    return (
      <div
        data-testid="jarvis-panel-unsupported"
        className={styles.unsupported}
      >
        <div className={styles.unsupportedTitle}>UNSUPPORTED PANEL</div>
        <div className={styles.unsupportedText}>
          This build has no renderer for what J.A.R.V.I.S proposed.
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className={styles.pending}>Connecting…</div>;
  }

  switch (data.kind) {
    case "line":
      return <PanelLine {...data} />;
    case "table":
      return <PanelTable {...data} />;
    case "gauge":
      return <PanelGauge {...data} />;
    case "sparkGrid":
      return <PanelSparkGrid {...data} />;
    case "heatmap":
      return <PanelHeatmap {...data} />;

    default: {
      const _exhaustive: never = data;
      return _exhaustive;
    }
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

const DISMISS_DURATION_S = 0.18;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
