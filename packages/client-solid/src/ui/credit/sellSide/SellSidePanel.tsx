import type { JSX } from "solid-js";
import { createMemo, For, Show } from "solid-js";

import {
  ADAPTIVE_BANK_NAME,
  type Instrument,
  type Quote,
  type Rfq,
} from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { TradeTicket } from "./TradeTicket";

import styles from "./SellSidePanel.module.css";

export function SellSidePanel(): JSX.Element {
  const { useRfqs, useInstruments, useDealers } = useViewModel();
  const rfqs = useRfqs();
  const instruments = useInstruments();
  const dealers = useDealers();

  const adaptiveBankId = createMemo((): number | undefined => {
    return dealers().find((d) => {
      return d.name === ADAPTIVE_BANK_NAME;
    })?.id;
  });

  const instrumentMap = createMemo((): Map<number, Instrument> => {
    const map = new Map<number, Instrument>();

    for (const i of instruments()) {
      map.set(i.id, i);
    }

    return map;
  });

  const showEmpty = createMemo((): boolean => {
    return adaptiveBankId() === undefined || rfqs().length === 0;
  });
  // Keyed by rfq id, not by the Rfq object itself (mirrors RfqsPanel's own
  // id-keyed `<For>`): an RFQ's state mutating (Open → Closed, a quote
  // arriving) is a fresh object reference for the SAME logical row, and
  // `<For>` keys by value identity — iterating the objects directly would
  // tear down and remount each TradeTicket (losing its in-progress typed
  // price) on every unrelated background update.
  const rfqIds = createMemo((): number[] => {
    return rfqs().map((r) => {
      return r.id;
    });
  });

  return (
    <div class={styles.panel}>
      <span class={styles.title}>Sell Side (Adaptive Bank)</span>

      <Show
        when={!showEmpty()}
        fallback={<div class={styles.empty}>No RFQs for Adaptive Bank</div>}
      >
        <For each={rfqIds()}>
          {(rfqId: number) => {
            // `rfqId` is drawn from `rfqIds()` (`rfqs().map(r => r.id)`), so
            // the lookup below always succeeds; `<Show keyed>` narrows
            // `Rfq | undefined` to `Rfq` without a non-null assertion.
            const rfq = createMemo((): Rfq | undefined => {
              return rfqs().find((r) => {
                return r.id === rfqId;
              });
            });

            return (
              <Show when={rfq()} keyed>
                {(currentRfq: Rfq) => {
                  return (
                    <SellSideRfqRow
                      rfq={currentRfq}
                      adaptiveBankId={adaptiveBankId() ?? -1}
                      instrumentMap={instrumentMap()}
                    />
                  );
                }}
              </Show>
            );
          }}
        </For>
      </Show>
    </div>
  );
}

interface SellSideRfqRowProps {
  rfq: Rfq;
  adaptiveBankId: number;
  instrumentMap: Map<number, Instrument>;
}

function SellSideRfqRow(props: SellSideRfqRowProps): JSX.Element {
  const { useQuotesForRfq } = useViewModel();
  const quotes = useQuotesForRfq(props.rfq.id);
  const abQuote = createMemo((): Quote | undefined => {
    return quotes().find((q) => {
      return q.dealerId === props.adaptiveBankId;
    });
  });

  return (
    <Show when={abQuote()} keyed>
      {(quote: Quote) => {
        return (
          <TradeTicket
            rfq={props.rfq}
            quote={quote}
            instrument={props.instrumentMap.get(props.rfq.instrumentId)}
          />
        );
      }}
    </Show>
  );
}
