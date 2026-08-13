import type { JSX } from "solid-js";

import { ModalShell } from "../modal/ModalShell";
import { PreferencesContent } from "./PreferencesContent";

/**
 * Preferences catalogue modal: the generic ModalShell dialog ceremony wrapping
 * PreferencesContent (the two-column preferences grid). Split so the grid can
 * be mounted un-clamped by the visual tier (`prefs/content`) while this
 * composition stays the app entry point — testids and DOM are unchanged from
 * the pre-split component.
 */
export function PreferencesModal(props: PreferencesModalProps): JSX.Element {
  return (
    <ModalShell
      open={props.open}
      title="PREFERENCES"
      subtitle="DISPLAY · MOTION · JARVIS · TRADING · NOTIFICATIONS · DATA"
      footNote="⚡ Static background recommended — lowest GPU load"
      ariaLabel="Preferences"
      closeAriaLabel="Close preferences"
      rootTestid="prefs-modal"
      closeTestid="prefs-close"
      doneTestid="prefs-done"
      onClose={props.onClose}
    >
      <PreferencesContent />
    </ModalShell>
  );
}

interface PreferencesModalProps {
  /** The modal renders only when `open` is true. */
  open: boolean;
  /** Fired when the modal is dismissed (✕ or DONE). */
  onClose: () => void;
}
