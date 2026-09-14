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
 *
 * The optional trailing "open chart" affordance (`onOpenChart`, Phase 4 Task
 * 5) is a real `<button>` rendered as a SIBLING of the row's own `<button>`,
 * both wrapped in a `.rowWrapper` div — never a descendant of it. A `<button>`
 * cannot validly nest another `<button>` (invalid HTML), so nesting was never
 * on the table, and a non-button `role="button"` stand-in trips this repo's
 * Biome `useSemanticElements` rule (a real `<button>` genuinely is available
 * here, unlike that rule's two documented false-positive exceptions in
 * `biome.jsonc`). Being SIBLINGS rather than nested also means a click on the
 * chart button can never bubble into the row's own `onClick` in the first
 * place — the structure itself makes the two independent.
 *
 * `props.onOpenChart`'s definedness is decided once by the ACTIVE layout
 * engine (dockview vs in-house), and a live engine-preference toggle
 * unmounts this whole panel and mounts a fresh one under the other engine's
 * own registry — it never flips on an already-mounted `WatchlistRow`. Still
 * branched via `<Show>` rather than a plain `if`/early-return
 * (`solid/components-return-once` flags the latter on principle, since it
 * can't see that invariant): `fallback` mirrors `WatchlistPanel.tsx`'s own
 * "NO INSTRUMENTS" fallback in being a plain, eagerly-materialized
 * `JSX.Element` rather than a lazy accessor, so `rowButton` below is built
 * once and simply lives wherever `<Show>` places it — `undefined` renders
 * the row `<button>` alone, byte-identical to the pre-Phase-4-Task-5 markup,
 * so in-house goldens are untouched.
 */
export function WatchlistRow(props: WatchlistRowProps): JSX.Element {
  const { useEquityQuote } = useViewModel();
  const quote = useEquityQuote(() => {
    return props.symbol;
  });
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

  function selectSymbol(): void {
    props.onSelect(props.symbol);
  }

  function openChart(): void {
    props.onOpenChart?.(props.symbol);
  }

  const rowButton = (
    <button
      type="button"
      data-testid={`watch-row-${props.symbol}`}
      data-watch-sym={props.symbol}
      data-selected={props.selected ? "true" : "false"}
      class={styles.row}
      onClick={selectSymbol}
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

  return (
    <Show when={props.onOpenChart !== undefined} fallback={rowButton}>
      <div class={styles.rowWrapper}>
        {rowButton}
        <button
          type="button"
          data-testid={`watch-open-chart-${props.symbol}`}
          class={styles.openChart}
          aria-label={`Open ${props.symbol} chart in a new panel`}
          title={`Open ${props.symbol} chart in a new panel`}
          disabled={props.chartDisabled}
          aria-disabled={props.chartDisabled}
          onClick={openChart}
        >
          📈
        </button>
      </div>
    </Show>
  );
}

export interface WatchlistRowProps {
  symbol: string;
  name: string;
  selected: boolean;
  onSelect: (symbol: string) => void;
  onQuote: (symbol: string, last: number, changePct: number) => void;
  /** Opens a dynamically-opened chart instance for this row's symbol (Phase 4
   * Task 5). Optional slot, mirroring `PanelHeadControls.onPopout?` — the
   * panel attaches it only when the layout engine is dockview (the in-house
   * engine cannot show instances); undefined renders the row `<button>`
   * alone (no wrapper, no chart button at all), so in-house goldens stay
   * byte-identical. */
  onOpenChart?: (symbol: string) => void;
  /** True when this symbol already has an open instance, or the per-tab cap
   * (MAX_PANEL_INSTANCES) is reached — the button renders `aria-disabled`
   * and `disabled` (mirrors `PanelHeadControls`' pairing), so a click is a
   * genuine no-op. Ignored (no button at all) when `onOpenChart` is
   * undefined. */
  chartDisabled?: boolean;
}

interface TickPulse {
  nonce: number;
  up: boolean;
}
