import { usePathname } from "expo-router";
import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConnectionStatus } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

import { resolveActiveModule } from "./moduleRoutes";
import { useShellTelemetry } from "./useShellTelemetry";

/** HUD status strip (prototype .dc.html:447-464): a telemetry line
 * (connection · latency · fps · clock · build) above a MODULE / SESSION line.
 * The active MODULE is derived from the current expo-router pathname — the
 * dock and deep links both drive it. */
export function StatusStrip(): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { useConnectionStatus } = useViewModel();
  const status = useConnectionStatus();
  const { fps, latencyMs, clock, build } = useShellTelemetry();
  const active = resolveActiveModule(pathname);

  return (
    <View
      testID="hud-status-strip"
      style={[styles.wrap, { paddingBottom: insets.bottom }]}
    >
      <View style={styles.telemetry}>
        <Text style={styles.conn}>{CONN_LABEL[status]}</Text>
        <Text style={styles.cell}>{latencyMs}MS</Text>
        <Text style={styles.cell}>{fps}FPS</Text>
        <Text style={styles.cell}>{clock}</Text>
        <Text style={styles.cell}>{build}</Text>
      </View>
      <View style={styles.moduleRow}>
        <View>
          <Text style={styles.kicker}>MODULE</Text>
          <Text testID="hud-module-label" style={styles.module}>
            {active.label}
          </Text>
        </View>
        <View style={styles.sessionCol}>
          <Text style={styles.kicker}>SESSION</Text>
          <Text style={styles.session}>TRADER.EI</Text>
        </View>
      </View>
    </View>
  );
}

const CONN_LABEL: Record<ConnectionStatus, string> = {
  [ConnectionStatus.CONNECTED]: "WS·CONNECTED",
  [ConnectionStatus.CONNECTING]: "WS·SYNC",
  [ConnectionStatus.DISCONNECTED]: "WS·DOWN",
  [ConnectionStatus.IDLE_DISCONNECTED]: "WS·IDLE",
  [ConnectionStatus.OFFLINE_DISCONNECTED]: "WS·OFFLINE",
};

interface StatusStripStyles {
  wrap: ViewStyle;
  telemetry: ViewStyle;
  conn: TextStyle;
  cell: TextStyle;
  moduleRow: ViewStyle;
  kicker: TextStyle;
  module: TextStyle;
  sessionCol: ViewStyle;
  session: TextStyle;
}

function makeStyles(t: RnTheme): StatusStripStyles {
  return StyleSheet.create({
    wrap: { backgroundColor: t.bgHeader },
    telemetry: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 11,
      paddingTop: 4,
      paddingBottom: 3,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.borderSubtle,
    },
    conn: {
      color: t.accentPositive,
      fontFamily: t.fontMono,
      fontSize: 8.5,
      letterSpacing: 0.8,
    },
    cell: {
      color: t.textMuted,
      fontFamily: t.fontMono,
      fontSize: 8.5,
      letterSpacing: 0.8,
    },
    moduleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      height: 60,
      paddingHorizontal: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border,
    },
    kicker: {
      color: t.textMuted,
      fontFamily: t.fontMono,
      fontSize: 8.5,
      letterSpacing: 2,
    },
    module: {
      color: t.accentPrimary,
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 1.6,
      marginTop: 1,
    },
    sessionCol: { alignItems: "flex-end" },
    session: {
      color: t.textSecondary,
      fontFamily: t.fontMono,
      fontSize: 10,
      marginTop: 2,
    },
  });
}
