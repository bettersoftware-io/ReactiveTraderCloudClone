import { Component, type ReactNode } from "react";

import styles from "./PanelErrorBoundary.module.css";

interface PanelErrorBoundaryProps {
  /** The panel's own display title (renderPanel already computes this for
   * the header), reused here so the fallback names the same panel a working
   * one would. */
  readonly title: string;
  readonly children: ReactNode;
}

interface PanelErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * Confines one panel's render (or effect) crash to that panel's own body
 * instead of letting it propagate past InhouseLayoutEngine and unmount the
 * whole app — the net behind the equities-dock crash this was added for
 * (ChartPanel's first render briefly saw an invalid empty symbol and threw
 * with no boundary anywhere in the tree; see createViewModel.ts and
 * CandleSeriesPresenter.ts for the other two layers of that fix).
 *
 * A class component is the only React primitive that can implement this
 * (there is no hook equivalent as of React 19) — the sanctioned exception to
 * this codebase's function-component convention; see
 * `rtc/class-filename-match` and `max-classes-per-file` in eslint.config.mjs.
 *
 * React's error-boundary mechanism catches errors thrown during a
 * descendant's render AND its passive effects (the latter is exactly how the
 * equities crash actually surfaced: react-rxjs's `bind()` re-throws a stream
 * error via a state-updater function invoked on the next render), so wrapping
 * `registry[panelId]?.()` in InhouseLayoutEngine.tsx is sufficient — no
 * effect-specific handling needed here.
 */
export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): PanelErrorBoundaryState {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  render(): ReactNode {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    return (
      <div className={styles.errorState} data-testid="panel-error">
        <span className={styles.errorLabel}>PANEL ERROR</span>
        <span className={styles.errorTitle}>{this.props.title}</span>
      </div>
    );
  }
}
