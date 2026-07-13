import type { JSX } from "solid-js";
import { ErrorBoundary } from "solid-js";

import styles from "./PanelErrorBoundary.module.css";

/**
 * Confines one panel's render crash to that panel's own body instead of
 * letting it propagate past InhouseLayoutEngine and unmount the whole app —
 * the net behind the equities-dock crash this was added for in the React
 * client (see the React file's own comment + CandleSeriesPresenter.ts for the
 * other layers of that fix).
 *
 * Solid ships a built-in `ErrorBoundary` (unlike React, which has no hook
 * equivalent and needs a class component): it wraps evaluation of its
 * `children` — which, per Solid's props-as-getters model, only actually runs
 * the wrapped component's body when the getter is read — in a try/catch, so a
 * synchronous render-phase throw from a descendant (`registry[panelId]?.()`
 * in InhouseLayoutEngine.tsx returning `() => <ThrowingPanel/>`, which throws
 * the moment its body runs) is caught here exactly like React's
 * class-boundary catches the analogous render-phase throw.
 */
export function PanelErrorBoundary(
  props: PanelErrorBoundaryProps,
): JSX.Element {
  return (
    <ErrorBoundary
      fallback={() => {
        return (
          <div class={styles.errorState} data-testid="panel-error">
            <span class={styles.errorLabel}>PANEL ERROR</span>
            <span class={styles.errorTitle}>{props.title}</span>
          </div>
        );
      }}
    >
      {props.children}
    </ErrorBoundary>
  );
}

interface PanelErrorBoundaryProps {
  /** The panel's own display title (PanelLeaf already computes this for
   * the header), reused here so the fallback names the same panel a working
   * one would. */
  readonly title: string;
  readonly children: JSX.Element;
}
