import { type Accessor, createMemo, Index, type JSX, Show } from "solid-js";

import type { DepthBook, DepthLevel } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./DepthLadder.module.css";

export function DepthLadder(props: DepthLadderProps): JSX.Element {
  const { useDepth } = useViewModel();
  // props.symbol is fixed for this DepthLadder's whole lifetime: its one
  // real caller, EqDepthDock, wraps it in a keyed <Show when={state().sel}
  // keyed> that fully remounts DepthLadder whenever the workspace selection
  // changes (see EqDepthDock.tsx's doc comment, and ChartPanel.tsx's for the
  // same keyed-remount pattern in full).
  // eslint-disable-next-line solid/reactivity -- setup-scope read is correct (see doc comment above)
  const book = useDepth(props.symbol);

  return (
    <Show
      when={book()}
      fallback={<div class={styles.empty}>NO DEPTH DATA</div>}
    >
      {(currentBook: Accessor<DepthBook>): JSX.Element => {
        const maxSize = createMemo((): number => {
          const b = currentBook();
          const allSizes = [
            ...b.bids.map((l) => {
              return l.size;
            }),
            ...b.asks.map((l) => {
              return l.size;
            }),
          ];
          return Math.max(...allSizes, 1);
        });

        // Show asks in reverse order (lowest ask at bottom, closest to mid)
        const asks = createMemo((): DepthLevel[] => {
          return [...currentBook().asks].slice(0, 8).reverse();
        });

        const bids = createMemo((): DepthLevel[] => {
          return currentBook().bids.slice(0, 8);
        });

        const spread = createMemo((): string => {
          const b = currentBook();
          const bestAsk = b.asks[0]?.price ?? 0;
          const bestBid = b.bids[0]?.price ?? 0;
          return bestAsk > 0 && bestBid > 0
            ? (bestAsk - bestBid).toFixed(2)
            : "—";
        });

        return (
          <div class={styles.ladder}>
            <div class={styles.section}>
              <div class={styles.sectionLabel}>ASKS</div>
              <Index each={asks()}>
                {(level: Accessor<DepthLevel>): JSX.Element => {
                  return (
                    <DepthRow
                      level={level()}
                      side="ask"
                      depth={level().size / maxSize()}
                    />
                  );
                }}
              </Index>
            </div>
            <div class={styles.spread}>SPREAD {spread()}</div>
            <div class={styles.section}>
              <div class={styles.sectionLabel}>BIDS</div>
              <Index each={bids()}>
                {(level: Accessor<DepthLevel>): JSX.Element => {
                  return (
                    <DepthRow
                      level={level()}
                      side="bid"
                      depth={level().size / maxSize()}
                    />
                  );
                }}
              </Index>
            </div>
          </div>
        );
      }}
    </Show>
  );
}

interface DepthLadderProps {
  symbol: string;
}

interface DepthRowProps {
  level: DepthLevel;
  side: "bid" | "ask";
  depth: number; // size / maxSize, [0, 1]
}

function DepthRow(props: DepthRowProps): JSX.Element {
  return (
    <div
      data-side={props.side}
      class={styles.row}
      // eslint-disable-next-line no-restricted-syntax -- runtime geometry via CSS custom property; static CSS can't express it
      style={{ "--depth": props.depth }}
    >
      <div class={styles.bar} />
      <span class={styles.price}>{props.level.price.toFixed(2)}</span>
      <span class={styles.size}>{props.level.size.toLocaleString()}</span>
    </div>
  );
}
