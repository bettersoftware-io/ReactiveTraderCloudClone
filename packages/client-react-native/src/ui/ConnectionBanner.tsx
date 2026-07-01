import type { JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ConnectionStatus } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

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
  const showReconnect =
    status !== ConnectionStatus.CONNECTED &&
    status !== ConnectionStatus.CONNECTING;

  return (
    <View style={styles.banner}>
      <Text>{LABEL[status]}</Text>
      {showReconnect ? (
        <Pressable
          onPress={() => {
            reconnect();
          }}
        >
          <Text>Reconnect</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
