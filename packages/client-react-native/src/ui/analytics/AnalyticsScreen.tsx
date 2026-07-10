import type { JSX } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { ExposureBubbles } from "#/ui/analytics/ExposureBubbles";
import { PairPnlBars } from "#/ui/analytics/PairPnlBars";
import { PnlChart } from "#/ui/analytics/PnlChart";
import { PnlValue } from "#/ui/analytics/PnlValue";
import { SurfaceCard } from "#/ui/SurfaceCard";
import { SPACING } from "#/ui/theme/spacing";
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

      <SurfaceCard
        variant="panel"
        testID="analytics-widget-pnl"
        style={styles.widget}
      >
        <Text style={styles.widgetTitle}>P&amp;L</Text>
        <PnlValue value={latestPnl} />
        <PnlChart history={data.history} />
      </SurfaceCard>

      <SurfaceCard
        variant="panel"
        testID="analytics-widget-exposure"
        style={styles.widget}
      >
        <Text style={styles.widgetTitle}>Exposure</Text>
        <ExposureBubbles positions={data.currentPositions} />
      </SurfaceCard>

      <SurfaceCard
        variant="panel"
        testID="analytics-widget-pairs"
        style={styles.widget}
      >
        <Text style={styles.widgetTitle}>Pair P&amp;L</Text>
        <PairPnlBars positions={data.currentPositions} />
      </SurfaceCard>
    </ScrollView>
  );
}

interface AnalyticsScreenStyles {
  panel: ViewStyle;
  content: ViewStyle;
  stale: ViewStyle;
  staleBadge: TextStyle;
  widget: ViewStyle;
  widgetTitle: TextStyle;
  loading: TextStyle;
}

function makeStyles(t: RnTheme): AnalyticsScreenStyles {
  return StyleSheet.create({
    panel: { flex: 1, backgroundColor: t.bgPrimary },
    content: { padding: 16, gap: 20 },
    stale: { opacity: 0.5 },
    staleBadge: { alignSelf: "flex-start", fontSize: 11, color: t.accentAware },
    widget: {
      marginHorizontal: SPACING.md,
      marginBottom: SPACING.md,
      padding: SPACING.md,
    },
    widgetTitle: {
      fontSize: 12,
      color: t.textMuted,
      fontFamily: t.fontDisplay,
      marginBottom: SPACING.sm,
      letterSpacing: 0.5,
    },
    loading: { padding: 16, color: t.textMuted },
  });
}
