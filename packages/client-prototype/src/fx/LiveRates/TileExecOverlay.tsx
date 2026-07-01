import type { CSSProperties, ReactElement } from "react";

import { fmtShort } from "#/fx/fxData";
import styles from "#/fx/LiveRates/TileExecOverlay.module.css";
import type { Dir, PairMeta, TileState } from "#/fx/types";

export interface TileExecOverlayProps {
  tile: TileState;
  meta: PairMeta;
  now: number;
}

const SPOT_OFFSET_DAYS = 2;
const MS_PER_SEC = 1000;

export function TileExecOverlay(
  props: TileExecOverlayProps,
): ReactElement | null {
  const { tile, meta, now } = props;

  if (tile.stage === "idle") {
    return null;
  }

  return <div className={styles.overlay}>{renderBody(tile, meta, now)}</div>;
}

function renderBody(
  tile: TileState,
  meta: PairMeta,
  now: number,
): ReactElement | null {
  switch (tile.stage) {
    case "executing":
    case "rfqReq":
      return <BusyBody rfqReq={tile.stage === "rfqReq"} />;
    case "rfqRecv":
      return <RfqBody tile={tile} now={now} />;
    case "success":
      return <DoneBody tile={tile} meta={meta} />;
    case "failure":
      return <FailureBody />;
    default:
      return null;
  }
}

interface BusyBodyProps {
  rfqReq: boolean;
}

function BusyBody(props: BusyBodyProps): ReactElement {
  const { rfqReq } = props;

  return (
    <>
      <div className={styles.spinner} />
      <div className={styles.busyLabel}>
        {rfqReq ? "REQUESTING QUOTE…" : "EXECUTING…"}
      </div>
      {rfqReq ? (
        <button type="button" className={styles.cancel} data-action="dismiss">
          CANCEL
        </button>
      ) : null}
    </>
  );
}

interface RfqBodyProps {
  tile: TileState;
  now: number;
}

function RfqBody(props: RfqBodyProps): ReactElement | null {
  const { tile, now } = props;
  const { quote, rfqStart, rfqEnd } = tile;

  if (quote == null || rfqStart == null || rfqEnd == null) {
    return null;
  }

  const secs = Math.max(0, Math.ceil((rfqEnd - now) / MS_PER_SEC));
  const pct = Math.max(0, ((rfqEnd - now) / (rfqEnd - rfqStart)) * 100);
  const barStyle = { "--rfq-pct": `${pct}%` } as CSSProperties;

  return (
    <>
      <div className={styles.quoteLabel}>QUOTE · {secs}s</div>
      <div className={styles.quoteRow}>
        <QuoteButton side="Sell" price={quote.Sell} />
        <QuoteButton side="Buy" price={quote.Buy} />
      </div>
      <div className={styles.progressTrack}>
        <div className={styles.progressBar} style={barStyle} />
      </div>
      <button type="button" className={styles.reject} data-action="dismiss">
        REJECT
      </button>
    </>
  );
}

interface QuoteButtonProps {
  side: Dir;
  price: string;
}

function QuoteButton(props: QuoteButtonProps): ReactElement {
  const { side, price } = props;
  const sideAttr = side === "Sell" ? "sell" : "buy";

  return (
    <button type="button" className={styles.quoteBtn} data-side={sideAttr}>
      <div className={styles.quoteSideLabel}>{side.toUpperCase()}</div>
      <div className={styles.quotePrice}>{price}</div>
    </button>
  );
}

interface DoneBodyProps {
  tile: TileState;
  meta: PairMeta;
}

function DoneBody(props: DoneBodyProps): ReactElement | null {
  const { tile, meta } = props;
  const { trade } = tile;

  if (trade == null) {
    return null;
  }

  const title = trade.dir === "Buy" ? "You Bought" : "You Sold";

  return (
    <>
      <div className={styles.iconSuccess}>✓</div>
      <div className={styles.doneTitle}>{title}</div>
      <div className={styles.doneSub}>
        {meta.base} {trade.notional}
      </div>
      <div className={styles.detailRow}>
        <DetailCell label="RATE" value={trade.rate ?? ""} />
        <DetailCell label="SPT" value={fmtShort(SPOT_OFFSET_DAYS)} />
        <DetailCell label="ID" value={String(trade.id)} />
      </div>
      <button type="button" className={styles.dismiss} data-action="dismiss">
        DISMISS
      </button>
    </>
  );
}

function FailureBody(): ReactElement {
  return (
    <>
      <div className={styles.iconFailure}>✕</div>
      <div className={styles.doneTitle}>Trade Rejected</div>
      <div className={styles.doneSub}>Execution failed — retry</div>
      <button type="button" className={styles.dismiss} data-action="dismiss">
        DISMISS
      </button>
    </>
  );
}

interface DetailCellProps {
  label: string;
  value: string;
}

function DetailCell(props: DetailCellProps): ReactElement {
  const { label, value } = props;

  return (
    <div className={styles.detailCell}>
      <div className={styles.detailLabel}>{label}</div>
      <div className={styles.detailValue}>{value}</div>
    </div>
  );
}
