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
        <Text style={styles.widgetTitle}>PROFIT &amp; LOSS · USD</Text>
        <PnlValue value={latestPnl} />
        <PnlChart history={data.history} />
      </SurfaceCard>

      <SurfaceCard
        variant="panel"
        testID="analytics-widget-pairs"
        style={styles.widget}
      >
        <Text style={styles.widgetTitle}>PAIR P&amp;L</Text>
        <PairPnlBars positions={data.currentPositions} />
      </SurfaceCard>

      <SurfaceCard
        variant="panel"
        testID="analytics-widget-exposure"
        style={styles.widget}
      >
        <Text style={styles.widgetTitle}>NET EXPOSURE · USD EQUIV</Text>
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
    // T38: the prototype's card titles are mono 8.5px on 2px tracking,
    // uppercase, with their unit qualifier (dc.html:167, 179, 192) — not the
    // 12px display font with 0.5 tracking this used to carry. The `· USD` /
    // `· USD EQUIV` suffixes are load-bearing copy, not decoration: without
    // them nothing on the screen says what currency the book is denominated
    // in.
    widgetTitle: {
      fontSize: 8.5,
      color: t.textMuted,
      fontFamily: t.fontMono,
      marginBottom: SPACING.sm,
      letterSpacing: 2,
    },
  });
}
