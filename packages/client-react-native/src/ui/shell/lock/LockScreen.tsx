import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Polygon } from "react-native-svg";

import { useViewModel } from "@rtc/react-bindings";

import { BiometricLine } from "#/ui/shell/lock/BiometricLine";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Full-screen session-lock overlay. Renders nothing unless the session is
 * locked; while locked it covers the whole shell — an absolute-fill <View>
 * (NOT an RN Modal: Modal-via-press segfaults under x86 jest) — and shows the
 * operator identity plus an AUTHENTICATE control that re-authenticates (unlock).
 * All state arrives through the reused `useSession` seam; only BiometricLine is
 * decorative. */
export function LockScreen(): JSX.Element | null {
  const { useSession } = useViewModel();
  const { state, unlock } = useSession();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (!state.locked) {
    return null;
  }

  const { user } = state;

  return (
    <View testID="lock-screen" style={styles.overlay}>
      <Svg width={72} height={72} viewBox="0 0 48 48">
        <Polygon
          points="24,3 40.6,13.5 40.6,34.5 24,45 7.4,34.5 7.4,13.5"
          fill="none"
          stroke={theme.accentPrimary}
          strokeWidth={1.3}
        />
        <Polygon
          points="24,8 36.3,15.75 36.3,31.25 24,39 11.7,31.25 11.7,15.75"
          fill="none"
          stroke={theme.accent2}
          strokeWidth={1}
          opacity={0.6}
        />
        <Circle cx={24} cy={24} r={3.4} fill={theme.accentPrimary} />
      </Svg>

      <Text testID="lock-title" style={styles.title}>
        SESSION LOCKED
      </Text>
      <Text style={styles.subtitle}>REACTIVE TRADER OS · {user.id}</Text>

      <View style={styles.avatar}>
        <Svg width={40} height={40} viewBox="0 0 28 28">
          <Polygon
            points="14,1.5 25,7.75 25,20.25 14,26.5 3,20.25 3,7.75"
            fill={theme.chip}
            stroke={theme.accentPrimary}
            strokeWidth={1.3}
          />
        </Svg>
        <Text style={styles.initials}>{user.initials}</Text>
      </View>

      <Text testID="lock-user-name" style={styles.name}>
        {user.name}
      </Text>
      <Text style={styles.role}>{user.role}</Text>

      <Pressable
        testID="lock-authenticate"
        onPress={() => {
          unlock();
        }}
      >
        <Text style={styles.authenticate}>AUTHENTICATE ▸</Text>
      </Pressable>

      <BiometricLine />
    </View>
  );
}

interface LockScreenStyles {
  overlay: ViewStyle;
  title: TextStyle;
  subtitle: TextStyle;
  avatar: ViewStyle;
  initials: TextStyle;
  name: TextStyle;
  role: TextStyle;
  authenticate: TextStyle;
}

function makeStyles(t: RnTheme): LockScreenStyles {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      // zIndex 200 orders LockScreen within Chrome; BootGate's 100 lives in a
      // different parent (sibling of Chrome) and paints above the whole Chrome
      // subtree regardless. The two overlays never coexist — the session starts
      // unlocked, so LockScreen is null throughout cold-start boot.
      zIndex: 200,
      elevation: 200,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: t.bgPrimary,
    },
    title: {
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 20,
      letterSpacing: 3,
    },
    subtitle: {
      color: t.textMuted,
      fontFamily: t.fontMono,
      fontSize: 11,
      letterSpacing: 1,
    },
    avatar: { alignItems: "center", justifyContent: "center" },
    initials: {
      position: "absolute",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 12,
    },
    name: { color: t.textPrimary, fontFamily: t.fontDisplay, fontSize: 16 },
    role: { color: t.textMuted, fontFamily: t.fontMono, fontSize: 11 },
    authenticate: {
      color: t.accentPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 14,
      letterSpacing: 1,
      marginTop: 8,
    },
  });
}
