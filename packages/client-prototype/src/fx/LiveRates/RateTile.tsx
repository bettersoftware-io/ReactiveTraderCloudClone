import type {
  ChangeEvent,
  CSSProperties,
  FocusEvent,
  ReactElement,
} from "react";

import { fmtShort } from "#/fx/fxData";
import styles from "#/fx/LiveRates/RateTile.module.css";
import { Sparkline } from "#/fx/LiveRates/Sparkline";
import { TilePrice } from "#/fx/LiveRates/TilePrice";
import type { PairMeta, Sym, TileState } from "#/fx/types";

export interface TileVm {
  sym: Sym;
  meta: PairMeta;
  rate: number;
  movePips: number;
  moveUp: boolean;
  flashOn: boolean;
  hist: number[];
  notional: string;
  notionalInvalid: boolean;
  isRfq: boolean;
  showCharts: boolean;
  onNotional(v: string): void;
  onReset(): void;
  onSell(): void;
  onBuy(): void;
}

export interface RateTileProps {
  vm: TileVm;
  stage: TileState["stage"];
  overlay?: ReactElement | null;
}

const SPOT_OFFSET_DAYS = 2;

export function RateTile(props: RateTileProps): ReactElement {
  const { vm, stage, overlay } = props;

  function handleNotionalChange(e: ChangeEvent<HTMLInputElement>): void {
    vm.onNotional(e.target.value);
  }

  function handleNotionalFocus(e: FocusEvent<HTMLInputElement>): void {
    e.target.select();
  }

  const moveColor = {
    "--move-color": vm.moveUp ? "var(--buy)" : "var(--sell)",
  } as CSSProperties;

  return (
    <div
      className={styles.tile}
      data-tile-sym={vm.sym}
      data-booked={String(stage === "success")}
      data-overlay-active={String(stage !== "idle")}
    >
      <div className={styles.header}>
        <span className={styles.pair}>{vm.meta.pair}</span>
        <span className={styles.move} style={moveColor}>
          {vm.moveUp ? "▲" : "▼"} {Math.abs(vm.movePips)} pip
        </span>
      </div>

      <div className={styles.notionalRow}>
        <label className={styles.baseLabel} htmlFor={`notional-${vm.sym}`}>
          {vm.meta.base}
        </label>
        <div className={styles.notionalWrap}>
          <input
            id={`notional-${vm.sym}`}
            className={styles.notionalInput}
            data-invalid={String(vm.notionalInvalid)}
            value={vm.notional}
            onChange={handleNotionalChange}
            onFocus={handleNotionalFocus}
          />
          <button
            type="button"
            className={styles.reset}
            aria-label="Reset notional"
            onClick={vm.onReset}
          >
            ↺
          </button>
        </div>
        {vm.notionalInvalid ? (
          <span className={styles.maxBadge}>MAX</span>
        ) : null}
      </div>

      <div className={styles.priceRow}>
        <button
          type="button"
          className={styles.priceBtn}
          data-side="sell"
          onClick={vm.onSell}
        >
          <TilePrice
            side="Sell"
            rate={vm.rate}
            meta={vm.meta}
            moveUp={vm.moveUp}
            flashOn={vm.flashOn}
            isRfq={vm.isRfq}
          />
        </button>
        <div className={styles.spreadLabel}>{vm.meta.spread}</div>
        <button
          type="button"
          className={styles.priceBtn}
          data-side="buy"
          onClick={vm.onBuy}
        >
          <TilePrice
            side="Buy"
            rate={vm.rate}
            meta={vm.meta}
            moveUp={vm.moveUp}
            flashOn={vm.flashOn}
            isRfq={vm.isRfq}
          />
        </button>
      </div>

      {vm.showCharts ? (
        <div className={styles.sparklineWrap}>
          <Sparkline hist={vm.hist} moveUp={vm.moveUp} />
        </div>
      ) : null}

      <div className={styles.footer}>
        <span className={styles.spotLabel}>
          SPT {fmtShort(SPOT_OFFSET_DAYS)}
        </span>
        <span className={styles.notionalSummary}>
          {vm.notional} {vm.meta.base}
        </span>
      </div>

      {overlay}
    </div>
  );
}
