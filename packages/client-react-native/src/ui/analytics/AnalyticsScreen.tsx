import type { JSX } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { AnalyticsDashboard } from "#/ui/analytics/AnalyticsDashboard";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/**
 * The Analytics tab: the live data seam, wrapped around the cards.
 *
 * The cards themselves live in `AnalyticsDashboard` so the visual harness can
 * mount them over pinned data — everything in THIS component is live and
 * therefore unscreenshottable.
 */
export function AnalyticsScreen(): JSX.Element {
  const { useAnalytics, useAnalyticsStaleFlag } = useViewModel();
  const data = useAnalytics();
  const stale = useAnalyticsStaleFlag();
  const styles = useThemedStyles(makeStyles);

  if (data === null) {
    return (
      <Text testID="analytics-loading" style={styles.loading}>
        Loading analytics…
      </Text>
    );
  }

  return (
    <ScrollView
      testID="analytics-panel"
      style={[styles.panel, stale ? styles.stale : null]}
      contentContainerStyle={styles.content}
    >
      {stale ? (
        <Text testID="analytics-stale" style={styles.staleBadge}>
          Stale
        </Text>
      ) : null}

      <AnalyticsDashboard data={data} />
    </ScrollView>
  );
}

interface AnalyticsScreenStyles {
  panel: ViewStyle;
  content: ViewStyle;
  stale: ViewStyle;
  staleBadge: TextStyle;
  loading: TextStyle;
}

function makeStyles(t: RnTheme): AnalyticsScreenStyles {
  return StyleSheet.create({
    panel: { flex: 1 },
    // The screen contributes only vertical inset (dc.html:165 `padding:12px
    // 12px 8px`): the cards own the 12px side inset + 10px stack gap
    // themselves (AnalyticsDashboard `widget`), so padding here would double
    // both — it did, at 16+12 sides / 20+12 gaps, until 2026-09-02.
    content: { paddingTop: 12, paddingBottom: 8 },
    stale: { opacity: 0.5 },
    staleBadge: {
      alignSelf: "flex-start",
      fontSize: 11,
      color: t.accentAware,
      marginHorizontal: 12,
    },
    loading: { padding: 16, color: t.textMuted },
  });
}
