import {
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  Show,
} from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import styles from "./WatchlistRow.module.css";

/**
 * One watchlist row — symbol + name on the left, last + %-change on the
 * right (colored by the real `changePct` sign — `data-up` on `.last`/`.chg`).
 * `data-selected` reflects the shared eqWorkspace selection; a click selects
 * this row's symbol there.
 *
 * The transient tick pulse is diffed from the PREVIOUS tick's `last` in a
 * plain closure variable inside an effect (Solid effects run after the
 * initial render, mirroring the React original's ref+effect timing) —
 * subscribing to the quote accessor and updating a signal in response.
 * Rather than a SECOND effect clearing the flash (an anti-pattern: cascading
 * updates with no external sync), the pulse overlay is KEYED on a monotonic
 * tick counter via `<Show keyed>`: each genuine tick swaps in a fresh overlay
 * element (Solid's keyed Show replaces the DOM node when the keyed value's
 * identity changes, the Solid analogue of React's `key`-based remount) whose
 * CSS `animation … forwards` plays once and settles invisible — no timer, no
 * clearing effect.
 */
export function WatchlistRow(props: WatchlistRowProps): JSX.Element {
  const { useEquityQuote } = useViewModel();
  const quote = useEquityQuote(props.symbol);
  let prevLast: number | undefined;
  const [tick, setTick] = createSignal<TickPulse>({ nonce: 0, up: true });

  createEffect(() => {
    const q = quote();

    if (!q) {
      return;
    }

    props.onQuote(props.symbol, q.last, q.changePct);

    const prev = prevLast;

    if (prev !== undefined && q.last !== prev) {
      const isUp = q.last > prev;
      setTick((t) => {
        return { nonce: t.nonce + 1, up: isUp };
      });
    }

    prevLast = q.last;
  });

  const changePct = createMemo((): number | undefined => {
    return quote()?.changePct;
  });
  const rowUp = createMemo((): boolean => {
    return (changePct() ?? 0) >= 0;
  });
  const lastText = createMemo((): string => {
    const last = quote()?.last;
    return last !== undefined ? last.toFixed(2) : "—";
  });
  const changeText = createMemo((): string => {
    const pct = changePct();
    return pct !== undefined ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—";
  });
  const pulseKey = createMemo((): number | false => {
    const t = tick();
    return t.nonce > 0 ? t.nonce : false;
  });

  return (
    <button
      type="button"
      data-testid={`watch-row-${props.symbol}`}
      data-watch-sym={props.symbol}
      data-selected={props.selected ? "true" : "false"}
      class={styles.row}
      onClick={() => {
        props.onSelect(props.symbol);
      }}
    >
      <span data-rank-glow="true" aria-hidden="true" class={styles.rankGlow} />
      <Show when={pulseKey()} keyed>
        {(_nonce: number): JSX.Element => {
          const up = tick().up;

          return (
            <span
              data-testid={`watch-flash-${props.symbol}`}
              data-flash="true"
              data-up={up ? "true" : "false"}
              class={styles.flashPulse}
              aria-hidden="true"
            />
          );
        }}
      </Show>
      <span class={styles.left}>
        <span class={styles.sym}>{props.symbol}</span>
        <span class={styles.name}>{props.name}</span>
      </span>
      <span class={styles.right}>
        <span class={styles.last} data-up={rowUp() ? "true" : "false"}>
          {lastText()}
        </span>
        <span class={styles.chg} data-up={rowUp() ? "true" : "false"}>
          {changeText()}
        </span>
      </span>
    </button>
  );
}

export interface WatchlistRowProps {
  symbol: string;
  name: string;
  selected: boolean;
  onSelect: (symbol: string) => void;
  onQuote: (symbol: string, last: number, changePct: number) => void;
}

interface TickPulse {
  nonce: number;
  up: boolean;
}
