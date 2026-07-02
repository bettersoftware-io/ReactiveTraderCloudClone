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
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

const LABEL: Record<ConnectionStatus, string> = {
  [ConnectionStatus.CONNECTING]: "Connecting…",
  [ConnectionStatus.CONNECTED]: "Live",
  [ConnectionStatus.DISCONNECTED]: "Disconnected",
  [ConnectionStatus.IDLE_DISCONNECTED]: "Disconnected (idle)",
  [ConnectionStatus.OFFLINE_DISCONNECTED]: "Offline",
};

/** Connection status banner with a Reconnect button — the sole recovery path
 * out of an idle/offline/disconnected socket (button-only, per the
 * `useReconnect` command's provenance comment on the ViewModel). */
export function ConnectionBanner(): JSX.Element {
  const { useConnectionStatus, useReconnect } = useViewModel();
  const status = useConnectionStatus();
  const reconnect = useReconnect();
  const styles = useThemedStyles(makeStyles);
  const showReconnect =
    status !== ConnectionStatus.CONNECTED &&
    status !== ConnectionStatus.CONNECTING;

  return (
    <View style={styles.banner}>
      <Text style={styles.label}>{LABEL[status]}</Text>
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

interface ConnectionBannerStyles {
  banner: ViewStyle;
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
    label: { color: t.textPrimary, fontFamily: t.fontDisplay },
    reconnect: { color: t.accentPrimary, fontFamily: t.fontDisplay },
  });
}
