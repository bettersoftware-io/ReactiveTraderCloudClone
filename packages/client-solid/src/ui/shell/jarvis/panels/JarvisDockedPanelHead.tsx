import type { JSX } from "solid-js";

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
export function JarvisDockedPanelHead(
  props: JarvisDockedPanelHeadProps,
): JSX.Element {
  function undockThisPanel(): void {
    props.onUndock(props.panelId);
  }

  function dismissThisPanel(): void {
    props.onDismiss(props.panelId);
  }

  return (
    <div class={styles.head}>
      <span class={styles.title}>{props.title}</span>
      <button
        type="button"
        data-testid="jarvis-panel-undock"
        aria-label={`Unpin ${props.title}`}
        class={styles.action}
        onClick={undockThisPanel}
      >
        📌
      </button>
      <button
        type="button"
        data-testid="jarvis-panel-close"
        aria-label={`Close ${props.title}`}
        class={styles.action}
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
