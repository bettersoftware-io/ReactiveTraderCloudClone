import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { CREDIT_QUANTITY_MULTIPLIER } from "@rtc/domain";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

interface QuantityInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function QuantityInput({
  value,
  onChange,
}: QuantityInputProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        Quantity (x{CREDIT_QUANTITY_MULTIPLIER.toLocaleString()})
      </Text>
      <TextInput
        testID="quantity-input"
        keyboardType="numeric"
        value={value}
        onChangeText={onChange}
        placeholder="Enter quantity..."
        placeholderTextColor={styles.placeholder.color}
        style={styles.input}
      />
    </View>
  );
}

interface QuantityInputStyles {
  wrapper: ViewStyle;
  label: TextStyle;
  input: TextStyle;
  placeholder: TextStyle;
}

function makeStyles(t: RnTheme): QuantityInputStyles {
  return StyleSheet.create({
    wrapper: { gap: 6 },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
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
  });
}
