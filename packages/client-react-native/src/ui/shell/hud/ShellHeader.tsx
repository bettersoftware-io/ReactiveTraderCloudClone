import type { JSX } from "react";
import { useEffect } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConnectionStatus } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { AppearanceButton } from "#/ui/shell/appearance/AppearanceButton";
import { LockButton } from "#/ui/shell/lock/LockButton";
import { FONT_ORBITRON_WORDMARK } from "#/ui/theme/fontFamilies";
import { labelStyle } from "#/ui/theme/labelStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

import { HexReticleLogo } from "./HexReticleLogo";
import { useShellMotionEnabled } from "./useShellMotionEnabled";

/** HUD header (prototype .dc.html:64-96): safe-area spacer, animated reticle
 * logo, Orbitron wordmark, an env badge that toggles simulator/live, a pulsing
 * connection dot (real `useConnectionStatus`), and the appearance/lock glyph
 * affordances. The pulse loop is gated by `useShellMotionEnabled()`.
 *
 * TWO controls on the right, both glyphs — the prototype's own count and form
 * (`.dc.html:88-94`). It carried three TEXT affordances until P7: `Theme`,
 * `Lock` and `Sign out`, roughly 70pt wider than the design budgets, which
 * overran a 402pt screen and clipped `Sign out` off the edge. Sign-out moved
 * into the Appearance sheet, where the web client keeps its account actions
 * too. Adding a third control here means re-measuring the row, not assuming it
 * fits: nothing about this layout shrinks. */
export function ShellHeader({
  simulator,
  onToggleSimulator,
  onOpenAppearance,
}: ShellHeaderProps): JSX.Element {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const enabled = useShellMotionEnabled();
  const { useConnectionStatus } = useViewModel();
  const status = useConnectionStatus();
  const connected = status === ConnectionStatus.CONNECTED;
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!enabled) {
      cancelAnimation(pulse);
      pulse.value = 1;
      return;
    }

    pulse.value = withRepeat(withTiming(0.35, { duration: 1200 }), -1, true);

    return () => {
      cancelAnimation(pulse);
    };
  }, [enabled, pulse]);

  const dotStyle = useAnimatedStyle(() => {
    return { opacity: pulse.value };
  });
  const envColor = simulator ? t.accentAware : t.accentPositive;
  const connColor = connected ? t.statusConnected : t.statusDisconnected;

  function toggleSimulator(): void {
    onToggleSimulator(!simulator);
  }

  return (
    <View
      testID="hud-header"
      style={[styles.header, { paddingTop: insets.top }]}
    >
      <View style={styles.left}>
        <HexReticleLogo />
        <Text testID="hud-wordmark" style={styles.wordmark}>
          REACTIVE<Text style={styles.wordmarkAccent}> TRADER</Text>
        </Text>
        <Pressable
          testID="hud-env-badge"
          accessibilityLabel="Toggle simulator"
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          onPress={toggleSimulator}
          style={[styles.envBadge, { borderColor: envColor }]}
        >
          <Text style={[styles.envLabel, { color: envColor }]}>
            {simulator ? "SIM" : "LIVE"}
          </Text>
        </Pressable>
      </View>
      <View style={styles.right}>
        <Animated.View
          testID="hud-conn-dot"
          style={[styles.dot, { backgroundColor: connColor }, dotStyle]}
        />
        <AppearanceButton onPress={onOpenAppearance} />
        <LockButton />
      </View>
    </View>
  );
}

export interface ShellHeaderProps {
  readonly simulator: boolean;
  readonly onToggleSimulator: (value: boolean) => void;
  readonly onOpenAppearance: () => void;
}

interface ShellHeaderStyles {
  header: ViewStyle;
  left: ViewStyle;
  right: ViewStyle;
  wordmark: TextStyle;
  wordmarkAccent: TextStyle;
  envBadge: ViewStyle;
  envLabel: TextStyle;
  dot: ViewStyle;
}

function makeStyles(t: RnTheme): ShellHeaderStyles {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingBottom: 0,
      backgroundColor: t.bgHeader,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    left: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      minWidth: 0,
      height: 52,
    },
    right: { flexDirection: "row", alignItems: "center", gap: 6 },
    // Orbitron, not the skin's display face: the design pins the wordmark to
    // one family across every skin (`.dc.html:85`), the same face the lock
    // screen's title carries. `weightedFont(t, "display", "700")` rendered it
    // in Chakra Petch instead.
    //
    // `minWidth` is load-bearing, not cosmetic. iOS self-sizes this <Text>
    // from a measurement taken in the SYSTEM font rather than in the bundled
    // family: the pre-Orbitron and post-Orbitron goldens laid the box out at
    // the IDENTICAL 132.7pt (env badge's left edge at 192.67pt in both), which
    // is SF Bold's width for this string — neither Chakra Petch's 130.3 nor
    // Orbitron's 155.6. Chakra fitted inside that box by luck. Orbitron
    // overruns it by ~23pt, and iOS clips the run to "REACTIVE TRAD". So the
    // box must reserve the real advance: 155.6pt at 11pt/2.2 tracking, or
    // 157.8 if iOS also kerns past the last glyph — hence 158. This is the
    // same defect the lock screen's title hit ("SESSION LOCKE"), which is also
    // Orbitron and is also fixed by taking its width from something other than
    // the self-measure.
    //
    // The row has the room: at 158 the left cluster ends near 255pt against
    // the right cluster's 275pt, so nothing has to give up size or tracking.
    wordmark: {
      color: t.textPrimary,
      fontFamily: FONT_ORBITRON_WORDMARK,
      fontSize: 11,
      letterSpacing: 2.2,
      minWidth: 158,
      flexShrink: 0,
    },
    wordmarkAccent: { color: t.accentPrimary },
    envBadge: {
      borderWidth: 1,
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    envLabel: labelStyle(t, 9, 1, "600"),
    dot: { width: 7, height: 7, borderRadius: 4, marginHorizontal: 8 },
  });
}
