import type { JSX } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { ExposureBubbles } from "#/ui/analytics/ExposureBubbles";
import { PairPnlBars } from "#/ui/analytics/PairPnlBars";
import { PnlChart } from "#/ui/analytics/PnlChart";
import { PnlValue } from "#/ui/analytics/PnlValue";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

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

  const latestPnl =
    data.history.length > 0 ? data.history[data.history.length - 1].usdPnl : 0;

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

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Profit &amp; Loss</Text>
        <PnlValue value={latestPnl} />
        <PnlChart history={data.history} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Positions</Text>
        <ExposureBubbles positions={data.currentPositions} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>PnL per Currency Pair</Text>
        <PairPnlBars positions={data.currentPositions} />
      </View>
    </ScrollView>
  );
}

interface AnalyticsScreenStyles {
  panel: ViewStyle;
  content: ViewStyle;
  stale: ViewStyle;
  staleBadge: TextStyle;
  section: ViewStyle;
  sectionLabel: TextStyle;
  loading: TextStyle;
}

function makeStyles(t: RnTheme): AnalyticsScreenStyles {
  return StyleSheet.create({
    panel: { flex: 1, backgroundColor: t.bgPrimary },
    content: { padding: 16, gap: 20 },
    stale: { opacity: 0.5 },
    staleBadge: { alignSelf: "flex-start", fontSize: 11, color: t.accentAware },
    section: { gap: 8 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
    loading: { padding: 16, color: t.textMuted },
  });
}
