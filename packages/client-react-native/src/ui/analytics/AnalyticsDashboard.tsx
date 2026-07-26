import type { JSX } from "react";
import { StyleSheet, Text, type TextStyle, type ViewStyle } from "react-native";

import type { PositionUpdates } from "@rtc/domain";

import { ExposureBubbles } from "#/ui/analytics/ExposureBubbles";
import { PairPnlBars } from "#/ui/analytics/PairPnlBars";
import { PnlChart } from "#/ui/analytics/PnlChart";
import { PnlValue } from "#/ui/analytics/PnlValue";
import { SurfaceCard } from "#/ui/SurfaceCard";
import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/**
 * The three Analytics cards, over data handed in rather than subscribed to.
 *
 * WHY THIS IS SPLIT FROM `AnalyticsScreen`. The screen owns the data seam —
 * `useAnalytics()`, the loading state, the stale wrapper — all of which are
 * live and, since the simulator now drifts positions every 10 s, permanently
 * in motion. The visual harness cannot screenshot that. Splitting the pure
 * presentation out lets the harness mount THIS with pinned data and capture
 * the real card layout, rather than a copy of it that would silently drift
 * from the screen. Same reason `BootSceneFixture` mounts a scene leaf instead
 * of the live boot sequence.
 *
 * Card order is the prototype's: P&L, then Pair P&L, then Exposure.
 */
export function AnalyticsDashboard({
  data,
}: AnalyticsDashboardProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const latestPnl =
    data.history.length > 0 ? data.history[data.history.length - 1].usdPnl : 0;

  return (
    <>
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
        testID="analytics-widget-pairs"
        style={styles.widget}
      >
        <Text style={styles.widgetTitle}>Pair P&amp;L</Text>
        <PairPnlBars positions={data.currentPositions} />
      </SurfaceCard>

      <SurfaceCard
        variant="panel"
        testID="analytics-widget-exposure"
        style={styles.widget}
      >
        <Text style={styles.widgetTitle}>Exposure</Text>
        <ExposureBubbles positions={data.currentPositions} />
      </SurfaceCard>
    </>
  );
}

interface AnalyticsDashboardProps {
  data: PositionUpdates;
}

interface AnalyticsDashboardStyles {
  widget: ViewStyle;
  widgetTitle: TextStyle;
}

function makeStyles(t: RnTheme): AnalyticsDashboardStyles {
  return StyleSheet.create({
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
  });
}
