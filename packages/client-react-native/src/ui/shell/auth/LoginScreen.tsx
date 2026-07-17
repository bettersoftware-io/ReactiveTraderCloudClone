import type { JSX } from "react";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Polygon } from "react-native-svg";

import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Full-screen sign-in form — the RN analogue of the web client's
 * `LoginScreen`, styled to match `LockScreen`'s hex-emblem overlay. Renders
 * unconditionally while mounted; `AuthGate` is expected to mount it only for
 * the non-"authenticated" branch of the auth lifecycle. Dumb component: all
 * state arrives through the `useAuth` hook seam, the typed credentials live
 * in local component state only, and the password is never logged. */
export function LoginScreen(): JSX.Element {
  const { useAuth } = useViewModel();
  const { state, login } = useAuth();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const authenticating = state.status === "authenticating";

  return (
    <View testID="login-screen" style={styles.overlay}>
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

      <Text testID="login-title" style={styles.title}>
        REACTIVE TRADER OS · SIGN IN
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>Username</Text>
        <TextInput
          testID="login-username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Enter username..."
          placeholderTextColor={styles.placeholder.color}
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          testID="login-password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Enter password..."
          placeholderTextColor={styles.placeholder.color}
          style={styles.input}
        />
      </View>

      {state.error !== null ? (
        <Text testID="login-error" style={styles.error}>
          {state.error}
        </Text>
      ) : null}

      <Pressable
        testID="login-submit"
        disabled={authenticating}
        onPress={() => {
          login(username, password);
        }}
      >
        <Text
          style={[styles.submit, authenticating ? styles.submitDisabled : null]}
        >
          AUTHENTICATE ▸
        </Text>
      </Pressable>
    </View>
  );
}

interface LoginScreenStyles {
  overlay: ViewStyle;
  title: TextStyle;
  field: ViewStyle;
  label: TextStyle;
  input: TextStyle;
  placeholder: TextStyle;
  error: TextStyle;
  submit: TextStyle;
  submitDisabled: TextStyle;
}

function makeStyles(t: RnTheme): LoginScreenStyles {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: t.bgPrimary,
      padding: 24,
    },
    title: {
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 18,
      letterSpacing: 3,
      marginBottom: 8,
      textAlign: "center",
    },
    field: { width: "100%", maxWidth: 320, gap: 4 },
    label: {
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
      fontSize: 12,
      letterSpacing: 1,
    },
    input: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 6,
      padding: 10,
      color: t.textPrimary,
      fontFamily: t.fontMono,
    },
    placeholder: { color: t.textMuted },
    error: {
      color: t.accentNegative,
      fontFamily: t.fontMono,
      fontSize: 12,
      marginTop: 4,
    },
    submit: {
      color: t.accentPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 14,
      letterSpacing: 1,
      marginTop: 12,
    },
    submitDisabled: { color: t.textMuted },
  });
}
