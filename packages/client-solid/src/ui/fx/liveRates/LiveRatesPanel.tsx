import type { JSX } from "solid-js";
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";

import {
  type CurrencyCategory,
  type CurrencyPair,
  matchesCurrencyFilter,
} from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { useFxView } from "#/ui/fx/useFxView";
import { useFlipGrid } from "#/ui/shell/motion/useFlipGrid";

import { CurrencyFilter } from "./CurrencyFilter";
import { Tile } from "./tile/Tile";
import { WatchlistView } from "./WatchlistView";

import styles from "./LiveRatesPanel.module.css";

export function LiveRatesPanel(): JSX.Element {
  const { useCurrencyPairs, useViewModePreference } = useViewModel();
  const pairs = useCurrencyPairs();
  // ViewMode persistence lives behind the seam (PreferencesPort); the CHARTS
  // chip in LiveRatesHead is the only writer. The category filter stays
  // local — it's transient view state, not a persisted preference.
  const { viewMode } = useViewModePreference();
  const { ratesTab } = useFxView();
  const [filter, setFilter] = createSignal<CurrencyCategory>("All");

  const filteredPairs = createMemo(() => {
    return pairs().filter((p) => {
      return matchesCurrencyFilter(p.symbol, filter());
    });
  });

  // Tiles glide (FLIP) to their new grid position whenever the filter changes
  // which pairs are shown; appearing tiles pop in, filtered-out ones fade out
  // in place (isotope-style).
  const { register } = useFlipGrid(
    () => {
      return [filter()];
    },
    { enter: true, exit: true },
  );

  return (
    <div class={styles.panel}>
      <div class={styles.controls}>
        <CurrencyFilter selected={filter()} onChange={setFilter} />
      </div>

      <Show
        when={pairs().length > 0}
        fallback={<div class={styles.empty}>Loading currency pairs...</div>}
      >
        <Show
          when={ratesTab() === "watchlist"}
          fallback={
            <div class={styles.grid}>
              <For each={filteredPairs()}>
                {(pair: CurrencyPair) => {
                  const setEl = register(pair.symbol);
                  onCleanup(() => {
                    setEl(null);
                  });
                  return (
                    <div ref={setEl} class={styles.tileSlot}>
                      <Tile pair={pair} showChart={viewMode() === "chart"} />
                    </div>
                  );
                }}
              </For>
            </div>
          }
        >
          <WatchlistView pairs={filteredPairs()} filter={filter()} />
        </Show>
      </Show>
    </div>
  );
}
