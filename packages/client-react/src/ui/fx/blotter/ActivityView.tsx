import type { ReactElement } from "react";

import type { ActivityEntry } from "@rtc/client-core";
import { Direction, TradeStatus } from "@rtc/domain";

import { formatNotional, formatRate } from "./blotterColumns";

import styles from "./ActivityView.module.css";

/** FX Blotter's "Activity" tab: one line per executed trade — time, a
 * TRADE/REJECT badge, and a description ("Sell EURUSD 1,000,000 @
 * 1.09205"). Pure render from `entries`; ported from
 * client-prototype/src/fx/Blotter/ActivityView.tsx. */
export function ActivityView({ entries }: ActivityViewProps): ReactElement {
  if (entries.length === 0) {
    return (
      <div data-testid="activity-feed" className={styles.empty}>
        {EMPTY_TEXT}
      </div>
    );
  }

  return (
    <ul data-testid="activity-feed" className={styles.list}>
      {entries.map((entry) => {
        return <ActivityRow key={entry.trade.tradeId} entry={entry} />;
      })}
    </ul>
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

function ActivityRow({ entry }: ActivityRowProps): ReactElement {
  const { trade, time } = entry;
  const isRejected = trade.status === TradeStatus.Rejected;
  const isBuy = trade.direction === Direction.Buy;

  return (
    <li
      data-testid="activity-row"
      data-tag={isRejected ? "reject" : "trade"}
      className={styles.row}
    >
      <span className={styles.time}>{time}</span>
      <span className={styles.tag}>{isRejected ? "REJECT" : "TRADE"}</span>
      <span className={styles.message}>
        <span
          data-direction={isBuy ? "buy" : "sell"}
          className={styles.direction}
        >
          {trade.direction}
        </span>{" "}
        {trade.currencyPair} {formatNotional(trade.notional)} @{" "}
        {formatRate(trade.spotRate)}
      </span>
    </li>
  );
}
