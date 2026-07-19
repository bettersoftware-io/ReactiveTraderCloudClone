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
import { LogoutButton } from "#/ui/shell/auth/LogoutButton";
import { LockButton } from "#/ui/shell/lock/LockButton";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

import { HexReticleLogo } from "./HexReticleLogo";
import { useShellMotionEnabled } from "./useShellMotionEnabled";

/** HUD header (prototype .dc.html:64-96): safe-area spacer, animated reticle
 * logo, Orbitron wordmark, an env badge that toggles simulator/live, a pulsing
 * connection dot (real `useConnectionStatus`), and the appearance/lock/logout
 * affordances. The pulse loop is gated by `useShellMotionEnabled()`. */
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

  return (
    <View
      testID="hud-header"
      style={[styles.header, { paddingTop: insets.top }]}
    >
      <View style={styles.left}>
        <HexReticleLogo />
        <Text style={styles.wordmark}>
          REACTIVE<Text style={styles.wordmarkAccent}> TRADER</Text>
        </Text>
        <Pressable
          testID="hud-env-badge"
          accessibilityLabel="Toggle simulator"
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          onPress={() => {
            onToggleSimulator(!simulator);
          }}
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
        <LogoutButton />
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
    wordmark: {
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 2.2,
    },
    wordmarkAccent: { color: t.accentPrimary },
    envBadge: {
      borderWidth: 1,
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    envLabel: {
      fontFamily: t.fontMono,
      fontSize: 9,
      fontWeight: "600",
      letterSpacing: 1,
    },
    dot: { width: 7, height: 7, borderRadius: 4, marginHorizontal: 8 },
  });
}
