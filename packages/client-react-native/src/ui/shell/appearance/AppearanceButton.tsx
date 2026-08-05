import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Toolbar affordance that opens the Appearance overlay. RN has no header
 * settings menu, so the toolbar carries the control (mirrors `LockButton`).
 *
 * A GLYPH, not the word "Theme" (P7). The prototype's header
 * (`Reactive Trader Mobile.dc.html:92`) draws this as a fixed 40x44 button
 * reading `◐`, and the port had substituted a text label. With `LockButton`
 * doing the same and a third text affordance beside them, the header's right
 * cluster overran a 402pt screen by 5 points and clipped its last control off
 * the edge — found by the `shell/chrome` golden, because nothing else had ever
 * rendered the whole header at once. The words were never the design. */
export function AppearanceButton({
  onPress,
}: AppearanceButtonProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      testID="appearance-button"
      accessibilityLabel="Appearance"
      style={styles.button}
      onPress={onPress}
    >
      {/* A literal glyph, never a unicode escape: a bare `\uXXXX` in JSX text
          renders as the escape's own characters, not the character. */}
      <Text style={styles.glyph}>◐</Text>
    </Pressable>
  );
}

interface AppearanceButtonProps {
  onPress: () => void;
}

interface AppearanceButtonStyles {
  button: ViewStyle;
  glyph: TextStyle;
}

/** The prototype's own button box, copied rather than approximated. A FIXED
 * size is the point: it makes the header's right cluster a predictable width
 * instead of one that grows with whatever its longest label happens to be,
 * which is the property the text version lacked. */
const BUTTON_WIDTH = 40;
const BUTTON_HEIGHT = 44;

function makeStyles(t: RnTheme): AppearanceButtonStyles {
  return StyleSheet.create({
    button: {
      width: BUTTON_WIDTH,
      height: BUTTON_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
    },
    // `textMuted`, not `accentPrimary`: the prototype draws both glyphs in its
    // dim colour and lifts them to the accent only on hover, which a phone has
    // no equivalent of. Accent-by-default would make two idle controls the
    // brightest things in the header.
    glyph: { fontSize: 16, color: t.textMuted },
  });
}
