import type { JSX } from "solid-js";
import { For, Show } from "solid-js";

import type { ActivityEntry } from "@rtc/client-core";
import { Direction, TradeStatus } from "@rtc/domain";

import { formatNotional, formatRate } from "./blotterColumns";

import styles from "./ActivityView.module.css";

/** FX Blotter's "Activity" tab: one line per executed trade — time, a
 * TRADE/REJECT badge, and a description ("Sell EURUSD 1,000,000 @
 * 1.09205"). Pure render from `entries`; ported from
 * client-prototype/src/fx/Blotter/ActivityView.tsx. */
export function ActivityView(props: ActivityViewProps): JSX.Element {
  return (
    <Show
      when={props.entries.length > 0}
      fallback={
        <div data-testid="activity-feed" class={styles.empty}>
          {EMPTY_TEXT}
        </div>
      }
    >
      <ul data-testid="activity-feed" class={styles.list}>
        <For each={props.entries}>
          {(entry: ActivityEntry) => {
            return <ActivityRow entry={entry} />;
          }}
        </For>
      </ul>
    </Show>
  );
}

const EMPTY_TEXT = "No activity yet — execute a trade to populate the feed";

export interface ActivityViewProps {
  /** Live-executed trades, newest first (BlotterPresenter.activity$ via
   * useViewModel().useActivity()) — the seeded historical blotter rows never
   * appear here; the feed starts empty and grows only as trades execute. */
  entries: readonly ActivityEntry[];
}

// — private subcomponent ——————————————————————————————————————————————————

interface ActivityRowProps {
  entry: ActivityEntry;
}

function ActivityRow(props: ActivityRowProps): JSX.Element {
  return (
    <li
      data-testid="activity-row"
      data-tag={
        props.entry.trade.status === TradeStatus.Rejected ? "reject" : "trade"
      }
      class={styles.row}
    >
      <span class={styles.time}>{props.entry.time}</span>
      <span class={styles.tag}>
        {props.entry.trade.status === TradeStatus.Rejected ? "REJECT" : "TRADE"}
      </span>
      <span class={styles.message}>
        <span
          data-direction={
            props.entry.trade.direction === Direction.Buy ? "buy" : "sell"
          }
          class={styles.direction}
        >
          {props.entry.trade.direction}
        </span>{" "}
        {props.entry.trade.currencyPair}{" "}
        {formatNotional(props.entry.trade.notional)} @{" "}
        {formatRate(props.entry.trade.spotRate)}
      </span>
    </li>
  );
}
