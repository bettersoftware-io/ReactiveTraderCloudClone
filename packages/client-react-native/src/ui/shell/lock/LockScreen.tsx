import type { JSX } from "react";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
 * operator identity plus a password-gated AUTHENTICATE control that
 * re-authenticates (unlock) against the real credentials seam. Dumb
 * component: all state arrives through the reused `useAuth` seam; the typed
 * password lives in local component state only and is never logged. Only
 * BiometricLine is decorative. Wrapped in `KeyboardAvoidingView` + a
 * `ScrollView` with `keyboardShouldPersistTaps="handled"` so the soft
 * keyboard never strands the AUTHENTICATE control on a real device. */
export function LockScreen(): JSX.Element | null {
  const { useAuth } = useViewModel();
  const { state, unlock } = useAuth();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [password, setPassword] = useState("");

  if (!state.locked || !state.user) {
    return null;
  }

  const { user } = state;

  return (
    <KeyboardAvoidingView
      testID="lock-screen"
      style={styles.overlay}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
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

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            testID="lock-password"
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
          <Text testID="lock-error" style={styles.error}>
            {state.error}
          </Text>
        ) : null}

        <Pressable
          testID="lock-authenticate"
          onPress={() => {
            unlock(password);
          }}
        >
          <Text style={styles.authenticate}>AUTHENTICATE ▸</Text>
        </Pressable>

        <BiometricLine />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface LockScreenStyles {
  overlay: ViewStyle;
  scroll: ViewStyle;
  scrollContent: ViewStyle;
  title: TextStyle;
  subtitle: TextStyle;
  avatar: ViewStyle;
  initials: TextStyle;
  name: TextStyle;
  role: TextStyle;
  field: ViewStyle;
  label: TextStyle;
  input: TextStyle;
  placeholder: TextStyle;
  error: TextStyle;
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
      backgroundColor: t.bgPrimary,
    },
    scroll: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
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
    field: { width: "100%", maxWidth: 320, gap: 4, marginTop: 8 },
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
    authenticate: {
      color: t.accentPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 14,
      letterSpacing: 1,
      marginTop: 8,
    },
  });
}
