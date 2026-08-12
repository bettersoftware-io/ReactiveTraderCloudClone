import type { ReactElement } from "react";
import { useRef } from "react";

import { type JarvisPanelVm, MAX_DOCKED_PANELS } from "@rtc/client-core";
import { useViewModel } from "@rtc/react-bindings";

import { animateOnce } from "#/ui/shell/motion";

import { JarvisPanelBody } from "./JarvisPanelBody";

import styles from "./JarvisPanelLayer.module.css";

/**
 * Fixed top-right cascade stack for J.A.R.V.I.S.'s generative-UI desk panels
 * (docs/architecture/18-jarvis-ai-agent-surface.md). Mounted as `JarvisOverlay`'s
 * SIBLING in App.tsx, not its child: panels keep rendering (and their own
 * `data$` keeps ticking) whether the chat overlay is open or closed.
 *
 * Renders `floatingPanels` ONLY — a docked panel leaves this layer entirely
 * and renders instead as a leaf inside the workspace engine (see
 * `dockedRegistryFor` in `appPanelRegistry.tsx`, wired from `App.tsx`).
 * `dockedPanels.length` still needs reading here, though, to gate the 📌
 * dock button once `MAX_DOCKED_PANELS` is reached.
 *
 * Chrome (title/rationale/dismiss/dock/testids) reads only
 * `useJarvisPanels()` — the list that changes on spawn/dismiss/edit/dock.
 * Each panel's BODY reads its own `useJarvisPanelData(panelId)`
 * independently (a keyed `bind()` in react-bindings mirroring
 * `useCandles`/`useDepth`), so one panel's tick cadence never re-renders its
 * siblings or the chrome list itself.
 */
export function JarvisPanelLayer(): ReactElement | null {
  const { useJarvisPanels } = useViewModel();
  const { dockedPanels, floatingPanels, dismissPanel, dockPanel } =
    useJarvisPanels();
  const dockFull = dockedPanels.length >= MAX_DOCKED_PANELS;

  if (floatingPanels.length === 0) {
    return null;
  }

  return (
    <div data-testid="jarvis-panel-layer" className={styles.layer}>
      {floatingPanels.map((panel) => {
        return (
          <JarvisPanelCard
            key={panel.panelId}
            panel={panel}
            dockFull={dockFull}
            onDismiss={dismissPanel}
            onDock={dockPanel}
          />
        );
      })}
    </div>
  );
}

interface JarvisPanelCardProps {
  panel: JarvisPanelVm;
  /** `dockedPanels.length >= MAX_DOCKED_PANELS` — disables the 📌 dock
   * button rather than letting it fire a no-op the panels machine would
   * silently swallow anyway, so the cap is legible in the UI. */
  dockFull: boolean;
  onDismiss: (panelId: string) => void;
  onDock: (panelId: string) => void;
}

function JarvisPanelCard({
  panel,
  dockFull,
  onDismiss,
  onDock,
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

  function dockThisPanel(): void {
    onDock(panel.panelId);
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
        <div className={styles.actions}>
          <button
            type="button"
            data-testid="jarvis-panel-dock"
            aria-label={`Pin ${panel.title} to workspace`}
            className={styles.dismiss}
            disabled={dockFull}
            onClick={dockThisPanel}
          >
            📌
          </button>
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

function prefersReducedMotion(): boolean {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

const DISMISS_DURATION_S = 0.18;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
