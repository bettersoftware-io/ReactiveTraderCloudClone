import { type ReactElement, type ReactNode, useEffect } from "react";

import { useDraggableDialog } from "./useDraggableDialog";

import styles from "./ModalShell.module.css";

/**
 * Generic draggable HUD dialog chrome: dimmed overlay, drag-by-header dialog
 * (`useDraggableDialog`), title/subtitle header with a ✕ control, a scrollable
 * body clamped to 86vh (the ONLY scroll container — content renders at natural
 * height inside it), and a footer note + DONE button. Takes focus when it
 * opens. Otherwise purely presentational:
 * every string/testid is a prop, both the ✕ and DONE fire the same `onClose`
 * slot, and the body renders `children` — so a surface owns its content
 * component and this shell owns the dialog ceremony. Extracted verbatim from
 * PreferencesModal (its only consumer today) so content can be visually
 * asserted un-clamped; see docs/superpowers/specs/2026-08-12-prefs-modal-
 * shell-split-and-boot-default-design.md.
 */
export function ModalShell({
  open,
  title,
  subtitle,
  footNote,
  ariaLabel,
  closeAriaLabel,
  rootTestid,
  closeTestid,
  doneTestid,
  onClose,
  children,
}: ModalShellProps): ReactElement | null {
  const { dialogRef, headerProps, dialogStyle } = useDraggableDialog({ open });

  // A dialog that opens takes focus, so the keyboard and a screen reader
  // land in it and not on whatever opened it. The dialog itself, not its
  // first control: nothing is activated by a stray Enter.
  useEffect(() => {
    if (open) {
      dialogRef.current?.focus();
    }
  }, [open, dialogRef]);

  if (!open) {
    return null;
  }

  return (
    <div data-testid={rootTestid} className={styles.overlay}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={styles.dialog}
        style={dialogStyle}
      >
        <header className={styles.head} {...headerProps}>
          <div>
            <div className={styles.title}>{title}</div>
            <div className={styles.subtitle}>{subtitle}</div>
          </div>
          <button
            type="button"
            data-testid={closeTestid}
            data-nodrag=""
            aria-label={closeAriaLabel}
            className={styles.closeButton}
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className={styles.body}>{children}</div>

        <footer className={styles.foot}>
          <span className={styles.footNote}>{footNote}</span>
          <button
            type="button"
            data-testid={doneTestid}
            className={styles.doneButton}
            onClick={onClose}
          >
            DONE
          </button>
        </footer>
      </div>
    </div>
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
  children: ReactNode;
}
