import type { JSX } from "react";
import { useState } from "react";
import {
  FlatList,
  type ListRenderItemInfo,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";

import type { Trade } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { BlotterFilterBar } from "#/ui/blotter/BlotterFilterBar";
import { BlotterHeader } from "#/ui/blotter/BlotterHeader";
import {
  type BlotterFilter,
  filterTrades,
  summarize,
} from "#/ui/blotter/blotterFilter";
import { TradeRow } from "#/ui/blotter/TradeRow";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The Blotter module screen root: the filter-chip bar (with its fills
 * summary) over the shared 4-column header and the animated trade-row list,
 * driven by the live `useTrades()`/`useNewTradeIds()`/`useActivity()` streams
 * from the ViewModel. The fills summary is always computed from the FULL
 * trade list, never the filtered subset — it's a blotter-wide total, so
 * selecting a status chip narrows the rows but leaves the summary unchanged.
 * Row insert/remove uses Reanimated's native layout-animation API
 * (`LinearTransition`/`FadeInDown`/`FadeOut`) — not `@rtc/motion-core`'s
 * `flipDeltas`, which targets the web clients' manual WAAPI path — all three
 * stripped to `undefined` when `useShellMotionEnabled()` is false.
 * `FadeInDown`/`FadeOut`/`LinearTransition` are for the filter-chip FLIP
 * (rows entering/leaving as the filter narrows or widens), not for trade
 * arrival — a genuinely new trade already gets the 950ms row-insert flash
 * (`TradeRow`/`useRowInsertFlash`), so `entering` is suppressed for rows the
 * module already knows are new (`newIds.has(item.tradeId)`) to avoid playing
 * both animations' opacity ramps at once; a filter change still reveals rows
 * via `FadeInDown` since those are never in `newIds`. Named
 * export (repo policy bans default exports outside `app/**` route files/
 * config); the route re-exports its own default from this. */
export function BlotterModule(): JSX.Element {
  const [filter, setFilter] = useState<BlotterFilter>("ALL");
  const { useTrades, useNewTradeIds, useActivity } = useViewModel();
  const trades = useTrades();
  const shown = filterTrades(trades, filter);
  const summary = summarize(trades);
  const timeById = new Map(
    useActivity().map((entry) => {
      return [entry.trade.tradeId, entry.time];
    }),
  );
  const newIds = useNewTradeIds();
  const motionEnabled = useShellMotionEnabled();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.root}>
      <BlotterFilterBar
        selected={filter}
        onSelect={setFilter}
        summary={summary}
      />
      <BlotterHeader />
      <FlatList
        testID="blotter-list"
        style={styles.list}
        data={shown}
        keyExtractor={keyExtractor}
        renderItem={({ item }: ListRenderItemInfo<Trade>) => {
          const isNew = newIds.has(item.tradeId);
          return (
            <Animated.View
              layout={
                motionEnabled ? LinearTransition.duration(320) : undefined
              }
              entering={
                motionEnabled && !isNew
                  ? FadeInDown.duration(300).delay(60)
                  : undefined
              }
              exiting={motionEnabled ? FadeOut.duration(220) : undefined}
            >
              <TradeRow
                trade={item}
                isNew={isNew}
                time={timeById.get(item.tradeId)}
              />
            </Animated.View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty} testID="blotter-empty">
            No trades yet
          </Text>
        }
      />
    </View>
  );
}

function keyExtractor(trade: Trade): string {
  return String(trade.tradeId);
}

interface BlotterModuleStyles {
  root: ViewStyle;
  list: ViewStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): BlotterModuleStyles {
  return StyleSheet.create({
    root: { flex: 1 },
    list: { flex: 1 },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontDisplay },
  });
}
