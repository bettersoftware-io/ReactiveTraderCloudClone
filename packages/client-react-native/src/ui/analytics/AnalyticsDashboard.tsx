import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { formatPnlK, type PositionUpdates } from "@rtc/domain";

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
  const delta = latestDelta(data.history);

  return (
    <>
      <SurfaceCard
        variant="panel"
        testID="analytics-widget-pnl"
        style={styles.widget}
      >
        <View style={styles.titleRow}>
          <Text style={styles.widgetTitle}>PROFIT &amp; LOSS · USD</Text>
          {delta === null ? null : (
            <View testID="analytics-pnl-delta" style={styles.deltaChip}>
              <Text style={styles.deltaLabel}>
                Δ {formatPnlK(delta.change)} / {delta.windowSecs}S
              </Text>
            </View>
          )}
        </View>
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

/**
 * The change over the most recent history step, for the header chip
 * (T39 — the prototype's `Δ +4.2K / 12S`, dc.html:977).
 *
 * The WINDOW IS DERIVED FROM THE TIMESTAMPS, not hardcoded. The prototype's
 * "12S" is its own mock cadence; ours is whatever `AnalyticsSimulator` is
 * appending at (10 s today). Reading it off the data means the label cannot
 * drift from reality if that interval ever changes — a hardcoded "10S" beside
 * a changed constant is exactly the class of stale-by-construction copy that
 * `blotter/seeded` re-dating itself (T32) came from.
 *
 * `null` with fewer than two points: there is no change to report yet, and a
 * chip reading "Δ +0k / 0S" would be an assertion rather than an absence.
 */
function latestDelta(history: PositionUpdates["history"]): PnlDelta | null {
  if (history.length < 2) {
    return null;
  }

  const last = history[history.length - 1];
  const previous = history[history.length - 2];
  const elapsedMs = Date.parse(last.timestamp) - Date.parse(previous.timestamp);

  return {
    change: last.usdPnl - previous.usdPnl,
    windowSecs: Math.max(0, Math.round(elapsedMs / 1000)),
  };
}

/** The P&L header chip's two values: the step change and the window it covers. */
interface PnlDelta {
  change: number;
  windowSecs: number;
}

interface AnalyticsDashboardProps {
  data: PositionUpdates;
}

interface AnalyticsDashboardStyles {
  widget: ViewStyle;
  titleRow: ViewStyle;
  widgetTitle: TextStyle;
  deltaChip: ViewStyle;
  deltaLabel: TextStyle;
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
    // dc.html:167 puts the delta in a bordered pill on the title's baseline,
    // right-aligned against the card edge.
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    deltaChip: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 4,
      paddingHorizontal: 7,
      paddingVertical: 3,
      marginBottom: SPACING.sm,
    },
    deltaLabel: {
      fontSize: 8.5,
      letterSpacing: 1,
      color: t.textSecondary,
      fontFamily: t.fontMono,
    },
  });
}
