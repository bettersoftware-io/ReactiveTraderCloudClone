import type { ReactElement } from "react";

import styles from "#/equities/Chart/InstrumentHeader.module.css";
import { EQ_META } from "#/equities/equitiesData";
import type { EqSym } from "#/equities/types";

const BID_ASK_OFFSET = 0.03;

export interface InstrumentHeaderProps {
  sym: EqSym;
  last: number;
  prev: number;
  flashOn: boolean;
  flashDir: 1 | -1;
  seriesHigh: number;
  seriesLow: number;
  vol: string;
}

// PROTO L607-618: the live instrument header — a static Orbitron ticker lede
// with the name/exchange beneath, a separate flash-coloured Orbitron price
// with its absolute+percent change, and the BID/ASK/RANGE/VOL stat strip.
export function InstrumentHeader(props: InstrumentHeaderProps): ReactElement {
  const { sym, last, prev, flashOn, flashDir, seriesHigh, seriesLow, vol } =
    props;
  const chgAbs = last - prev;
  const chgPct = (chgAbs / prev) * 100;
  const up = chgAbs >= 0;
  const dayHi = Math.max(seriesHigh, last);
  const dayLo = Math.min(seriesLow, last);

  return (
    <div className={styles.header}>
      <div className={styles.idBlock}>
        <div className={styles.sym}>{sym}</div>
        <div className={styles.name}>
          {EQ_META[sym].name} · {EQ_META[sym].exch}
        </div>
      </div>
      <div className={styles.priceBlock}>
        <div
          className={styles.last}
          data-flash={String(flashOn)}
          data-dir={flashDir === 1 ? "up" : "down"}
        >
          {last.toFixed(2)}
        </div>
        <div className={styles.change} data-up={String(up)}>
          {up ? "+" : ""}
          {chgAbs.toFixed(2)} ({up ? "+" : ""}
          {chgPct.toFixed(2)}%)
        </div>
      </div>
      <div className={styles.spacer} />
      <div className={styles.stats}>
        <Stat
          label="BID"
          value={(last - BID_ASK_OFFSET).toFixed(2)}
          tone="sell"
        />
        <Stat
          label="ASK"
          value={(last + BID_ASK_OFFSET).toFixed(2)}
          tone="buy"
        />
        <Stat
          label="DAY RANGE"
          value={`${dayLo.toFixed(2)} – ${dayHi.toFixed(2)}`}
          tone="text"
        />
        <Stat label="VOL" value={vol} tone="text" />
      </div>
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  tone: "buy" | "sell" | "text";
}

function Stat(props: StatProps): ReactElement {
  const { label, value, tone } = props;

  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} data-tone={tone}>
        {value}
      </div>
    </div>
  );
}
