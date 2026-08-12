import type { Accessor, JSX } from "solid-js";
import { createMemo } from "solid-js";

import type { JarvisPanelVm } from "@rtc/client-core";

import styles from "./JarvisDockedPanelHead.module.css";

/**
 * A docked desk panel's `headRegistry` slot (see `dockedHeadsFor` in
 * `appHeadRegistry.tsx`, wired from `App.tsx`'s `WorkspaceEngine`) — title
 * plus unpin + close. Renders inside `InhouseLayoutEngine`'s
 * `.panelHeadContent`, which REPLACES the engine's own default title span
 * (see `LiveRatesHead`'s doc for the same convention), so this component
 * carries its own title. The engine's collapse/maximize controls render
 * separately in `.panelControls`, untouched by this slot.
 *
 * `title` is looked up reactively from `dockedPanels` (the shared
 * `useJarvisPanels()` accessor threaded down from `WorkspaceEngine`, not a
 * captured string prop) so a title rename while docked updates this
 * already-mounted head in place — see `dockedHeadsFor`'s doc for why the
 * containing registry no longer changes identity on a same-membership tick.
 * Falls back to `panelId` for the same reason `PanelLeaf`'s own `title()`
 * does: a defensive default for the (expected-transient-or-never) tick
 * where this id isn't found in `dockedPanels()` yet.
 */
export function JarvisDockedPanelHead(
  props: JarvisDockedPanelHeadProps,
): JSX.Element {
  const title = createMemo((): string => {
    const panel = props.dockedPanels().find((row) => {
      return row.panelId === props.panelId;
    });
    return panel?.title ?? props.panelId;
  });

  function undockThisPanel(): void {
    props.onUndock(props.panelId);
  }

  function dismissThisPanel(): void {
    props.onDismiss(props.panelId);
  }

  return (
    <div class={styles.head}>
      <span class={styles.title}>{title()}</span>
      <button
        type="button"
        data-testid="jarvis-panel-undock"
        aria-label={`Unpin ${title()}`}
        class={styles.action}
        onClick={undockThisPanel}
      >
        📌
      </button>
      <button
        type="button"
        data-testid="jarvis-panel-close"
        aria-label={`Close ${title()}`}
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
  dockedPanels: Accessor<readonly JarvisPanelVm[]>;
  /** Slot — fired with `panelId` to undock this panel back to the floating
   * overlay. */
  onUndock: (panelId: string) => void;
  /** Slot — fired with `panelId` to dismiss this panel outright (detaches
   * its leaf first, via `Presenters.dismissPanel`, the caller's job to
   * supply). */
  onDismiss: (panelId: string) => void;
}
