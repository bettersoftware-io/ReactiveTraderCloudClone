import type { JSX } from "solid-js";
import { Show } from "solid-js";

import { useDraggableDialog } from "./useDraggableDialog";

import styles from "./ModalShell.module.css";

/**
 * Generic draggable HUD dialog chrome: dimmed overlay, drag-by-header dialog
 * (`useDraggableDialog`), title/subtitle header with a ✕ control, a scrollable
 * body clamped to 86vh (the ONLY scroll container — content renders at natural
 * height inside it), and a footer note + DONE button. Purely presentational:
 * every string/testid is a prop, both the ✕ and DONE fire the same `onClose`
 * slot, and the body renders `children` — so a surface owns its content
 * component and this shell owns the dialog ceremony. Extracted verbatim from
 * PreferencesModal (its only consumer today) so content can be visually
 * asserted un-clamped; see docs/superpowers/specs/2026-08-12-prefs-modal-
 * shell-split-and-boot-default-design.md.
 */
export function ModalShell(props: ModalShellProps): JSX.Element {
  const { dialogRef, headerProps, dialogStyle } = useDraggableDialog({
    open: () => {
      return props.open;
    },
  });

  function closeModal(): void {
    props.onClose();
  }

  return (
    <Show when={props.open}>
      <div data-testid={props.rootTestid} class={styles.overlay}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-label={props.ariaLabel}
          class={styles.dialog}
          style={dialogStyle()}
        >
          <header class={styles.head} {...headerProps}>
            <div>
              <div class={styles.title}>{props.title}</div>
              <div class={styles.subtitle}>{props.subtitle}</div>
            </div>
            <button
              type="button"
              data-testid={props.closeTestid}
              data-nodrag=""
              aria-label={props.closeAriaLabel}
              class={styles.closeButton}
              onClick={closeModal}
            >
              ✕
            </button>
          </header>

          <div class={styles.body}>{props.children}</div>

          <footer class={styles.foot}>
            <span class={styles.footNote}>{props.footNote}</span>
            <button
              type="button"
              data-testid={props.doneTestid}
              class={styles.doneButton}
              onClick={closeModal}
            >
              DONE
            </button>
          </footer>
        </div>
      </div>
    </Show>
  );
}

interface ModalShellProps {
  /** The shell renders only when `open` is true (the hook still sees the
   * transition, preserving drag-position reset semantics). */
  open: boolean;
  title: string;
  subtitle: string;
  /** Footer left-side note (e.g. a ⚡ hint line). */
  footNote: string;
  /** aria-label for the dialog element. */
  ariaLabel: string;
  /** aria-label for the ✕ control. */
  closeAriaLabel: string;
  rootTestid: string;
  closeTestid: string;
  doneTestid: string;
  /** Fired by both the ✕ and DONE controls. */
  onClose: () => void;
  children: JSX.Element;
}
