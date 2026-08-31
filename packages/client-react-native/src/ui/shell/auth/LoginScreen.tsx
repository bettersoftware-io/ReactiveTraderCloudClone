import type { JSX } from "react";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { LockEmblem } from "#/ui/shell/lock/LockEmblem";
import { FONT_ORBITRON_WORDMARK } from "#/ui/theme/fontFamilies";
import { labelStyle } from "#/ui/theme/labelStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Full-screen sign-in form — the RN analogue of the web client's
 * `LoginScreen`, and the pre-session sibling of `LockScreen`: the same hex
 * emblem, the Orbitron wordmark over a tracked-mono line, the lock's bordered
 * 220-wide input with an uppercase mono placeholder (labelled for assistive
 * tech, not on screen — the mobile design carries no Title-case sans labels
 * anywhere), the submit as the boot chrome's bordered mono pill. Renders
 * unconditionally while mounted; `AuthGate` is expected to mount it only for
 * the non-"authenticated" branch of the auth lifecycle. Dumb component: all
 * state arrives through the `useAuth` hook seam, the typed credentials live
 * in local component state only, and the password is never logged.
 * `simulator`/`onToggleSimulator` surface the same Sim/Live toggle `Chrome`
 * renders post-auth, so it's reachable before signing in — the only such
 * toggle when the app boots against a sleeping or credential-less live
 * server. Wrapped in `KeyboardAvoidingView` + a `ScrollView` with
 * `keyboardShouldPersistTaps="handled"` so the soft keyboard never strands
 * the submit control on a real device. */
export function LoginScreen({
  simulator,
  onToggleSimulator,
}: LoginScreenProps): JSX.Element {
  const { useAuth } = useViewModel();
  const { state, login } = useAuth();
  const styles = useThemedStyles(makeStyles);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const authenticating = state.status === "authenticating";

  return (
    <KeyboardAvoidingView
      testID="login-screen"
      style={styles.overlay}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <LockEmblem />

        <Text testID="login-title" style={styles.title}>
          REACTIVE TRADER
        </Text>
        <Text style={styles.subtitle}>OS · SIGN IN</Text>

        <TextInput
          testID="login-username"
          accessibilityLabel="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="USERNAME"
          placeholderTextColor={styles.placeholder.color}
          style={styles.input}
        />
        <TextInput
          testID="login-password"
          accessibilityLabel="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="PASSWORD"
          placeholderTextColor={styles.placeholder.color}
          style={styles.input}
        />

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
          style={styles.submit}
        >
          <Text
            style={[
              styles.submitLabel,
              authenticating ? styles.submitLabelDisabled : null,
            ]}
          >
            AUTHENTICATE ▸
          </Text>
        </Pressable>

        <View style={styles.simRow}>
          <Text style={styles.simLabel}>SIMULATOR MODE</Text>
          <Switch
            testID="login-sim-toggle"
            value={simulator}
            onValueChange={onToggleSimulator}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface LoginScreenProps {
  simulator: boolean;
  onToggleSimulator: (value: boolean) => void;
}

interface LoginScreenStyles {
  overlay: ViewStyle;
  scroll: ViewStyle;
  scrollContent: ViewStyle;
  title: TextStyle;
  subtitle: TextStyle;
  input: TextStyle;
  placeholder: TextStyle;
  error: TextStyle;
  submit: ViewStyle;
  submitLabel: TextStyle;
  submitLabelDisabled: TextStyle;
  simRow: ViewStyle;
  simLabel: TextStyle;
}

// Every value below is `LockScreen`'s (title / subtitle / input / error) or
// `BootSequence`'s SKIP pill (submit) — one idiom for the two pre-session
// overlays, so the sign-in screen reads as the lock's sibling rather than a
// leftover of the pre-redesign form it used to be.
function makeStyles(t: RnTheme): LoginScreenStyles {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: t.bgPrimary,
    },
    scroll: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    // `alignSelf: "stretch"` + centred text on both tracked lines: a
    // self-sized iOS <Text> with `letterSpacing` measures without the last
    // glyph's trailing advance and clips it (see `LockScreen`).
    title: {
      marginTop: 18,
      alignSelf: "stretch",
      textAlign: "center",
      color: t.textPrimary,
      fontFamily: FONT_ORBITRON_WORDMARK,
      fontSize: 13,
      letterSpacing: 4,
    },
    subtitle: {
      marginTop: 8,
      marginBottom: 22,
      alignSelf: "stretch",
      textAlign: "center",
      color: t.textMuted,
      ...labelStyle(t, 9.5, 1.6),
    },
    input: {
      width: 220,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      borderRadius: 9,
      paddingVertical: 9,
      paddingHorizontal: 12,
      textAlign: "center",
      color: t.textPrimary,
      ...labelStyle(t, 11, 1.5),
    },
    placeholder: { color: t.textMuted },
    error: {
      marginBottom: 12,
      alignSelf: "stretch",
      textAlign: "center",
      color: t.accentNegative,
      ...labelStyle(t, 10, 1),
    },
    submit: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      borderRadius: 6,
      paddingVertical: 9,
      paddingHorizontal: 14,
    },
    submitLabel: {
      color: t.accentPrimary,
      ...labelStyle(t, 10, 2, "600"),
    },
    submitLabelDisabled: { color: t.textMuted },
    simRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 26,
    },
    simLabel: {
      color: t.textMuted,
      ...labelStyle(t, 8.5, 2),
    },
  });
}
