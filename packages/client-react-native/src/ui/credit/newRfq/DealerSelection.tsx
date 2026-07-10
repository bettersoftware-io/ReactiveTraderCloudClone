import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { Dealer } from "@rtc/domain";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function DealerSelection({
  dealers,
  selectedIds,
  onChange,
}: DealerSelectionProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  function toggle(id: number): void {
    const next = new Set(selectedIds);

    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }

    onChange(next);
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Dealers</Text>
      <View style={styles.list}>
        {dealers.map((dealer) => {
          const checked = selectedIds.has(dealer.id);
          return (
            <Pressable
              key={dealer.id}
              testID={`dealer-${dealer.id}`}
              style={styles.row}
              onPress={() => {
                toggle(dealer.id);
              }}
            >
              <Text style={styles.box}>{checked ? "☑" : "☐"}</Text>
              <Text style={styles.name}>{dealer.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

interface DealerSelectionProps {
  dealers: readonly Dealer[];
  selectedIds: Set<number>;
  onChange: (ids: Set<number>) => void;
}

interface DealerSelectionStyles {
  wrapper: ViewStyle;
  label: TextStyle;
  list: ViewStyle;
  row: ViewStyle;
  box: TextStyle;
  name: TextStyle;
}

function makeStyles(t: RnTheme): DealerSelectionStyles {
  return StyleSheet.create({
    wrapper: { gap: 6 },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
    list: { gap: 4 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 4,
    },
    box: { fontSize: 16, color: t.accentPrimary },
    name: { fontSize: 14, color: t.textPrimary, fontFamily: t.fontDisplay },
  });
}
