import type {
  Machine,
  RfqQuote,
  RfqState,
  RfqTileIntents,
  Stream,
} from "@rtc/core-api";
import {
  type CurrencyPair,
  REJECTED_DISPLAY_MS,
  RFQ_COUNTDOWN_INTERVAL_MS,
  RFQ_TIMEOUT_MS,
  type RfqQuoteResult,
} from "@rtc/domain";

import { once } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { AbortError } from "#/kernel/AbortError";
import { createRunSlot, type Run } from "#/kernel/runSlot";
import { sleep } from "#/kernel/sleep";
import { createStore } from "#/kernel/store";

export interface RfqTileDeps {
  /** The request-quote command (`RfqQuotePresenter.requestQuote`), injected
   * so timing is controllable in tests. */
  requestQuote: (
    symbol: string,
    pipsPosition: number,
  ) => Stream<RfqQuoteResult>;
}

const INIT: RfqState = { status: "init", quote: null, remainingMs: 0 };
const REQUESTED: RfqState = {
  status: "requested",
  quote: null,
  remainingMs: 0,
};
const REJECTED: RfqState = { status: "rejected", quote: null, remainingMs: 0 };

/** The RxJS machine's one-run-per-request shape on a `Store`: `requested`,
 * then either a received countdown derived from the tick index (never the
 * clock) that falls through to the rejected hold at zero, or the rejected
 * hold at once when the request fails. `cancel`/`accept` abort the run and
 * reset; `reject` aborts it and runs the hold alone; each intent is guarded
 * to the state it is valid in, as the RxJS intents are. Abort releases the
 * in-flight port call through `once`'s signal. */
export function createRfqTileMachine(
  pair: CurrencyPair,
  deps: RfqTileDeps,
): Machine<RfqState, RfqTileIntents> {
  const store = createStore<RfqState>(INIT);
  const slot = createRunSlot(store);

  async function holdRejected(run: Run<RfqState>): Promise<void> {
    run.set(REJECTED);
    await sleep(REJECTED_DISPLAY_MS, run.signal);
    run.set(INIT);
  }

  async function runQuote(run: Run<RfqState>): Promise<void> {
    run.set(REQUESTED);
    let quote: RfqQuote | null = null;

    try {
      const result = await once(
        deps.requestQuote(pair.symbol, pair.pipsPosition),
        run.signal,
      );
      quote = { bid: result.bid, ask: result.ask, timeoutMs: RFQ_TIMEOUT_MS };
    } catch (error) {
      if (error instanceof AbortError) {
        throw error;
      }
    }

    if (quote !== null) {
      for (
        let remainingMs = RFQ_TIMEOUT_MS;
        remainingMs > 0;
        remainingMs -= RFQ_COUNTDOWN_INTERVAL_MS
      ) {
        run.set({ status: "received", quote, remainingMs });
        await sleep(RFQ_COUNTDOWN_INTERVAL_MS, run.signal);
      }
    }

    await holdRejected(run);
  }

  return {
    state$: storeToStateStream(store),
    intents: {
      requestQuote: () => {
        if (!slot.isDisposed() && store.get().status === "init") {
          slot.start(runQuote);
        }
      },
      cancel: () => {
        if (!slot.isDisposed() && store.get().status === "requested") {
          slot.end();
          store.set(INIT);
        }
      },
      accept: () => {
        if (!slot.isDisposed() && store.get().status === "received") {
          slot.end();
          store.set(INIT);
        }
      },
      reject: () => {
        if (!slot.isDisposed() && store.get().status === "received") {
          slot.start(holdRejected);
        }
      },
    },
    dispose: () => {
      slot.dispose();
    },
  };
}
