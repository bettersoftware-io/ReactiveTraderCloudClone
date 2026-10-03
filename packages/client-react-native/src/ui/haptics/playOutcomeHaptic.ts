import * as Haptics from "expo-haptics";

/** The one haptic every ceremony ends on: a success or an error notification.
 *
 * Deliberately NOT gated on `useShellMotionEnabled`. A haptic is not motion —
 * reduced-motion and power-saver Freeze strip a ceremony's animation, which
 * makes the haptic the only non-visual confirmation left, so muting it there
 * removes feedback from exactly the users who lost the flourish. iOS has its
 * own System Haptics switch, which `expo-haptics` already honours. */
export function playOutcomeHaptic(positive: boolean): void {
  void Haptics.notificationAsync(
    positive
      ? Haptics.NotificationFeedbackType.Success
      : Haptics.NotificationFeedbackType.Error,
  );
}
