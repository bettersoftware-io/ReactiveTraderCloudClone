import type { JSX } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The mobile-v1 sheet switch: a 44x26 pill track with a 20px knob that slides
 * between x=2 (off) and x=21 (on), ported verbatim from the prototype's
 * ambient toggle (`Reactive Trader Mobile.dc.html`, appearance-sheet block —
 * `width:44px;height:26px;border-radius:13px;border:1px solid var(--border)`
 * with `background: aurora ? chip : transparent` and a knob coloured
 * `aurora ? acc : faint`).
 *
 * Hand-rolled rather than RN's `Switch`: that control renders the platform's
 * own geometry (iOS ships a 51x31 track with a white knob and its own accent
 * treatment) and exposes no track-size, knob-size or knob-colour surface, so
 * it cannot be made to match these numbers at all.
 *
 * The knob is a plain absolutely-positioned `View` swapped between two static
 * styles rather than an animated one — the sheet is captured under power-saver
 * `freeze` in the visual tier, where every animation must be absent rather
 * than merely settled. */
export function SheetSwitch({
  testID,
  checked,
  accessibilityLabel,
  onToggle,
}: SheetSwitchProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked }}
      style={checked ? styles.trackOn : styles.track}
      onPress={() => {
        onToggle(!checked);
      }}
    >
      <View
        testID={`${testID}-knob`}
        style={checked ? styles.knobOn : styles.knob}
      />
    </Pressable>
  );
}

interface SheetSwitchProps {
  /** Carried by the pressable track itself, so a caller's existing
   * press-the-toggle test keeps working after the row around it stops being
   * pressable (the design's row is inert; only the switch takes the press). */
  readonly testID: string;
  readonly checked: boolean;
  readonly accessibilityLabel: string;
  /** Slot: receives the value the press is asking for, not the current one. */
  readonly onToggle: (next: boolean) => void;
}

interface SheetSwitchStyles {
  track: ViewStyle;
  trackOn: ViewStyle;
  knob: ViewStyle;
  knobOn: ViewStyle;
}

function makeStyles(t: RnTheme): SheetSwitchStyles {
  const track: ViewStyle = {
    width: 44,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: t.borderPrimary,
  };

  // `top: 2` with a 20px knob inside a 26px track leaves 2px below as well —
  // the design's own numbers, which centre the knob without a flex rule.
  const knob: ViewStyle = {
    position: "absolute",
    top: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
  };

  return StyleSheet.create({
    track: { ...track, backgroundColor: "transparent" },
    trackOn: { ...track, backgroundColor: t.chip },
    knob: { ...knob, left: 2, backgroundColor: t.textMuted },
    knobOn: { ...knob, left: 21, backgroundColor: t.accentPrimary },
  });
}
