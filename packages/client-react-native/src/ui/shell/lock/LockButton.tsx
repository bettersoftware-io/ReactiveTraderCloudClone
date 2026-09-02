import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Toolbar affordance that locks the session. RN has no header AccountMenu, so
 * the toolbar carries the lock control; it raises the LockScreen overlay via
 * the reused `useAuth().lock()` seam.
 *
 * A GLYPH, not the word "Lock" (P7) — the prototype's header
 * (`Reactive Trader Mobile.dc.html:93`) draws a fixed 40x44 `⌖`. See
 * `AppearanceButton` for the full note on why the text version was the defect.
 *
 * `accessibilityLabel` is REQUIRED here in a way it was not before: the label
 * used to be the word "Lock", which a screen reader could read. A bare `⌖`
 * announces as nothing useful, so dropping to a glyph without naming the
 * control would trade a visual bug for an accessibility one. */
export function LockButton(): JSX.Element {
  const { useAuth } = useViewModel();
  const { lock } = useAuth();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      testID="lock-button"
      accessibilityLabel="Lock session"
      style={styles.button}
      onPress={lock}
    >
      <Text style={styles.glyph}>⌖</Text>
    </Pressable>
  );
}

interface LockButtonStyles {
  button: ViewStyle;
  glyph: TextStyle;
}

/** Matches `AppearanceButton` — the prototype gives both header controls the
 * same box, and a mismatched pair would read as a mistake. */
const BUTTON_WIDTH = 40;
const BUTTON_HEIGHT = 44;

function makeStyles(t: RnTheme): LockButtonStyles {
  return StyleSheet.create({
    button: {
      width: BUTTON_WIDTH,
      height: BUTTON_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
    },
    // 15, against the appearance glyph's 16 — the prototype sets each size to
    // the glyph rather than to the button, so the two optically match despite
    // `⌖` and `◐` having different ink.
    glyph: { fontSize: 15, color: t.textMuted },
  });
}
