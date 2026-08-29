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

/** The mobile-v1 boxed segmented control — the sub-nav the design puts under
 * the header on the Credit and Equities screens: one 1px `--border` frame,
 * radius 9, inset `10px 12px 0`, with equal-width 9px-mono segments that
 * fill with the accent when active and sit transparent otherwise (the
 * prototype's `eqTabs` / `credTabs`). Uppercasing is the caller's — the
 * labels are copy, not a transform.
 *
 * `idPrefix` fixes the test surface: the frame is `${idPrefix}-nav`, each
 * segment `${idPrefix}-tab-${key}` — the ids the e2e/jest contracts key on. */
export function SegmentedControl<K extends string>({
  segments,
  value,
  onChange,
  idPrefix,
}: SegmentedControlProps<K>): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.frame} testID={`${idPrefix}-nav`}>
      {segments.map((segment) => {
        const active = segment.key === value;

        return (
          <Pressable
            key={segment.key}
            testID={`${idPrefix}-tab-${segment.key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={active ? styles.segmentActive : styles.segment}
            onPress={() => {
              onChange(segment.key);
            }}
          >
            <Text style={active ? styles.labelActive : styles.label}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface Segment<K extends string> {
  readonly key: K;
  readonly label: string;
}

interface SegmentedControlProps<K extends string> {
  readonly segments: readonly Segment<K>[];
  readonly value: K;
  readonly onChange: (key: K) => void;
  readonly idPrefix: string;
}

interface SegmentedControlStyles {
  frame: ViewStyle;
  segment: ViewStyle;
  segmentActive: ViewStyle;
  label: TextStyle;
  labelActive: TextStyle;
}

function makeStyles(t: RnTheme): SegmentedControlStyles {
  const segment: ViewStyle = {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
  };

  const label: TextStyle = {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.5,
    fontFamily: t.fontMono,
  };

  return StyleSheet.create({
    frame: {
      flexDirection: "row",
      marginTop: 10,
      marginHorizontal: 12,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      borderRadius: 9,
      overflow: "hidden",
    },
    segment,
    segmentActive: { ...segment, backgroundColor: t.accentPrimary },
    label: { ...label, color: t.textSecondary },
    labelActive: { ...label, color: t.textOnAccent },
  });
}
