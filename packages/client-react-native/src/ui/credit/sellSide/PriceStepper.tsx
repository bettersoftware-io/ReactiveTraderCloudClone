// packages/client-react-native/src/ui/credit/sellSide/PriceStepper.tsx
import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

/** The sell-side price control: two 44×44 pads either side of a large mono
 * readout (prototype dc.html:300-302), replacing the free-text price field.
 *
 * A stepper rather than a keyboard because this is a one-thumb, time-boxed
 * action — the RFQ window is counting down while the operator types. `onChange`
 * is a slot, so it is named `onX`; the concrete handlers below are named for
 * what they do to the price. */
export function PriceStepper({
  value,
  onChange,
}: PriceStepperProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  function lowerPrice(): void {
    onChange(roundPrice(Math.max(0, value - PRICE_STEP)));
  }

  function raisePrice(): void {
    onChange(roundPrice(value + PRICE_STEP));
  }

  return (
    <View style={styles.row}>
      <Pressable
        testID="price-stepper-down"
        accessibilityRole="button"
        accessibilityLabel="Lower the price"
        style={styles.pad}
        onPress={lowerPrice}
      >
        <Text style={styles.padLabel}>−</Text>
      </Pressable>
      <Text style={styles.price}>{value.toFixed(PRICE_DECIMALS)}</Text>
      <Pressable
        testID="price-stepper-up"
        accessibilityRole="button"
        accessibilityLabel="Raise the price"
        style={styles.pad}
        onPress={raisePrice}
      >
        <Text style={styles.padLabel}>+</Text>
      </Pressable>
    </View>
  );
}

export interface PriceStepperProps {
  readonly value: number;
  readonly onChange: (next: number) => void;
}

/** One tick of the desk's price ladder. */
const PRICE_STEP = 0.05;
const PRICE_DECIMALS = 2;

/** `98.4 + 0.05` is `98.44999999999999` in float64. Every step re-enters this
 * function, so without the round the error would accumulate across taps and
 * eventually reach the wire. */
function roundPrice(price: number): number {
  return Number(price.toFixed(PRICE_DECIMALS));
}

interface PriceStepperStyles {
  row: ViewStyle;
  pad: ViewStyle;
  padLabel: TextStyle;
  price: TextStyle;
}

function makeStyles(t: RnTheme): PriceStepperStyles {
  // dc.html:300-302 — 44×44 pads, `radius 9`, 1px border, accent `16px`; the
  // price `24px/700` mono and centred; `gap: 9`.
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 9 },
    pad: {
      width: 44,
      height: 44,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: t.borderSubtle,
      alignItems: "center",
      justifyContent: "center",
    },
    padLabel: { fontSize: 16, color: t.accentPrimary, fontFamily: t.fontMono },
    price: {
      flex: 1,
      textAlign: "center",
      fontSize: 24,
      color: t.textPrimary,
      ...weightedFont(t, "mono", "700"),
    },
  });
}
