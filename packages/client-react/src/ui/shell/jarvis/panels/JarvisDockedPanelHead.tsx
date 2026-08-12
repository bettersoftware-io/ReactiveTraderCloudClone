import type { ReactElement } from "react";

import styles from "./JarvisDockedPanelHead.module.css";

/**
 * A docked desk panel's `headRegistry` slot (see `dockedHeadsFor` in
 * `appHeadRegistry.tsx`, wired from `App.tsx`'s `WorkspaceEngine`) — title
 * plus unpin + close. Renders inside `InhouseLayoutEngine`'s
 * `.panelHeadContent`, which REPLACES the engine's own default title span
 * (see `LiveRatesHead`'s doc for the same convention), so this component
 * carries its own title. The engine's collapse/maximize controls render
 * separately in `.panelControls`, untouched by this slot.
 */
export function JarvisDockedPanelHead({
  panelId,
  title,
  onUndock,
  onDismiss,
}: JarvisDockedPanelHeadProps): ReactElement {
  function undockThisPanel(): void {
    onUndock(panelId);
  }

  function dismissThisPanel(): void {
    onDismiss(panelId);
  }

  return (
    <div className={styles.head}>
      <span className={styles.title}>{title}</span>
      <button
        type="button"
        data-testid="jarvis-panel-undock"
        aria-label={`Unpin ${title}`}
        className={styles.action}
        onClick={undockThisPanel}
      >
        📌
      </button>
      <button
        type="button"
        data-testid="jarvis-panel-close"
        aria-label={`Close ${title}`}
        className={styles.action}
        onClick={dismissThisPanel}
      >
        ✕
      </button>
    </div>
  );
}

interface JarvisDockedPanelHeadProps {
  panelId: string;
  title: string;
  /** Slot — fired with `panelId` to undock this panel back to the floating
   * overlay. */
  onUndock: (panelId: string) => void;
  /** Slot — fired with `panelId` to dismiss this panel outright (detaches
   * its leaf first, via `Presenters.dismissPanel`, the caller's job to
   * supply). */
  onDismiss: (panelId: string) => void;
}
