import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { ConnectionStatus } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Connection status banner with a Reconnect button — the sole recovery path
 * out of an idle/offline/disconnected socket (button-only, per the
 * `useReconnect` command's provenance comment on the ViewModel). */
export function ConnectionBanner(): JSX.Element {
  const { useConnectionStatus, useReconnect } = useViewModel();
  const status = useConnectionStatus();
  const reconnect = useReconnect();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const showReconnect =
    status !== ConnectionStatus.CONNECTED &&
    status !== ConnectionStatus.CONNECTING;

  return (
    <View style={styles.banner}>
      <View style={styles.pill}>
        <View
          testID="connection-dot"
          style={[styles.dot, { backgroundColor: dotColorFor(status, theme) }]}
        />
        <Text style={styles.label}>{LABEL[status]}</Text>
      </View>
      {showReconnect ? (
        <Pressable
          onPress={() => {
            reconnect();
          }}
        >
          <Text style={styles.reconnect}>Reconnect</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const LABEL: Record<ConnectionStatus, string> = {
  [ConnectionStatus.CONNECTING]: "Connecting…",
  [ConnectionStatus.CONNECTED]: "Live",
  [ConnectionStatus.DISCONNECTED]: "Disconnected",
  [ConnectionStatus.IDLE_DISCONNECTED]: "Disconnected (idle)",
  [ConnectionStatus.OFFLINE_DISCONNECTED]: "Offline",
};

/** Maps each connection status to the theme token that colours the pill's
 * status dot. Built per-render from the live theme (`useTheme()`) since the
 * colour depends on runtime status, not a static StyleSheet value. */
function dotColorFor(status: ConnectionStatus, t: RnTheme): string {
  const DOT_COLOR: Record<ConnectionStatus, string> = {
    [ConnectionStatus.CONNECTED]: t.statusConnected,
    [ConnectionStatus.CONNECTING]: t.statusConnecting,
    [ConnectionStatus.DISCONNECTED]: t.statusDisconnected,
    [ConnectionStatus.IDLE_DISCONNECTED]: t.statusDisconnected,
    [ConnectionStatus.OFFLINE_DISCONNECTED]: t.statusDisconnected,
  };
  return DOT_COLOR[status];
}

interface ConnectionBannerStyles {
  banner: ViewStyle;
  pill: ViewStyle;
  dot: ViewStyle;
  label: TextStyle;
  reconnect: TextStyle;
}

function makeStyles(t: RnTheme): ConnectionBannerStyles {
  return StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: t.bgHeader,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: t.chip,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    label: { color: t.textPrimary, fontFamily: t.fontDisplay, fontSize: 12 },
    reconnect: { color: t.accentPrimary, fontFamily: t.fontDisplay },
  });
}
