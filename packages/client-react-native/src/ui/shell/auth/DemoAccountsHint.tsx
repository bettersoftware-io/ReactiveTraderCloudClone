import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { type DemoAccount, sharedDemoPassword } from "@rtc/domain";

import { labelStyle } from "#/ui/theme/labelStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/**
 * The demo-accounts hint on the sign-in screen — the RN analogue of the web
 * clients' `DemoAccountsHint`: one tap-to-fill row per account, plus the
 * password printed once when every account shares it. Renders nothing when
 * the host lists no accounts, which is every sign-in against a real server:
 * those credentials belong to the server, and listing them here would
 * advertise logins the app cannot vouch for. Dumb component: picking a row
 * only reports the account through `onPick`.
 */
export function DemoAccountsHint({
  accounts,
  busy,
  onPick,
}: DemoAccountsHintProps): JSX.Element | null {
  const styles = useThemedStyles(makeStyles);

  if (accounts.length === 0) {
    return null;
  }

  const password = sharedDemoPassword(accounts);

  function pickFor(account: DemoAccount) {
    return (): void => {
      onPick(account);
    };
  }

  return (
    <View
      testID="login-demo-accounts"
      style={busy ? styles.hintReceded : styles.hint}
    >
      <Text style={styles.heading}>DEMO ACCOUNTS · SIMULATED DATA</Text>

      {accounts.map((account) => {
        return (
          <Pressable
            key={account.username}
            testID={`login-demo-account-${account.username}`}
            accessibilityRole="button"
            accessibilityLabel={`Fill the sign-in form as ${account.username}, ${account.role}`}
            disabled={busy}
            onPress={pickFor(account)}
            style={styles.account}
          >
            <Text style={styles.username}>{account.username}</Text>
            <Text style={styles.role} numberOfLines={1}>
              {account.role}
            </Text>
            <Text style={styles.arrow}>▸</Text>
          </Pressable>
        );
      })}

      <View style={styles.foot}>
        {password !== null ? (
          <Text style={styles.footText}>
            PASSWORD ·{" "}
            <Text testID="login-demo-password" style={styles.password}>
              {password}
            </Text>
          </Text>
        ) : null}
        <Text style={styles.footText}>TAP TO FILL</Text>
      </View>
    </View>
  );
}

interface DemoAccountsHintProps {
  accounts: readonly DemoAccount[];
  /** True while a sign-in is in flight: the rows are disabled and the block
   * recedes with the fields. */
  busy: boolean;
  /** Slot: an account row was picked. */
  onPick: (account: DemoAccount) => void;
}

interface DemoAccountsHintStyles {
  hint: ViewStyle;
  hintReceded: ViewStyle;
  heading: TextStyle;
  account: ViewStyle;
  username: TextStyle;
  role: TextStyle;
  arrow: TextStyle;
  foot: ViewStyle;
  footText: TextStyle;
  password: TextStyle;
}

function makeStyles(t: RnTheme): DemoAccountsHintStyles {
  const hint: ViewStyle = {
    width: 280,
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: t.borderPrimary,
  };

  return StyleSheet.create({
    hint,
    // The fields' recede (`LoginScreen` `inputReceded`), on the whole block.
    hintReceded: { ...hint, opacity: 0.35 },
    heading: {
      marginBottom: 6,
      alignSelf: "stretch",
      textAlign: "center",
      color: t.textMuted,
      ...labelStyle(t, 8.5, 2),
    },
    // username | role | arrow. The username column is fixed so the roles line
    // up whatever the name's length.
    account: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 8,
    },
    username: {
      width: 84,
      color: t.accentPrimary,
      ...labelStyle(t, 10.5, 0.5),
    },
    role: {
      flex: 1,
      color: t.textSecondary,
      ...labelStyle(t, 9.5, 0.5),
    },
    arrow: {
      color: t.textMuted,
      ...labelStyle(t, 9.5, 0),
    },
    foot: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 6,
      paddingHorizontal: 8,
    },
    footText: {
      color: t.textMuted,
      ...labelStyle(t, 8.5, 1.5),
    },
    password: { color: t.textSecondary },
  });
}
