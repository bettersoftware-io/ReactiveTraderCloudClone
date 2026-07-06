import type { ReactElement } from "react";
import { useState } from "react";

import {
  type CreditRfqFilter,
  type Dealer,
  type Instrument,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { useFlipGrid } from "#/ui/shell/motion/useFlipGrid";

import { EmptyRfqs } from "./EmptyRfqs";
import { RfqCard } from "./RfqCard";
import { type CardAnim, cardAnim, enterCascadeAdditions } from "./rfqCardAnim";
import { rfqCardVm } from "./rfqCardVm";

import styles from "./RfqsPanel.module.css";

/** PROTO Rfqs/RfqsPanel.tsx: the RFQs panel — a FLIP-glided grid of RfqCards
 * (or the empty state when the active filter matches nothing). The active
 * filter (LIVE/CLOSED/ALL) lives behind the shared useCreditRfqFilterPreference
 * seam — this panel only READS it; RfqsHead's filter pills (Task 4) write it,
 * the same head/body split LiveRatesHead/LiveRatesPanel use for viewMode.
 *
 * Entrance/exit/tab-switch-cascade animation (PROTO isNew/tabRecent/
 * exitingRfqs) is re-derived client-side without a clock: `entering`/
 * `exiting` are plain id-keyed maps/sets, computed by diffing the shown-id
 * set across renders (see rfqCardAnim.ts) via React's "adjust state during
 * render" pattern, and cleared via each card's own `onAnimationEnd` — src/ui
 * may not use setTimeout/Date.now (tests/scripts/grep-gates.ts gate 29), so
 * there is no fixed-ms flash/retain window the way the prototype's hook has
 * one; a dismiss instead waits for the real CSS exit animation to finish
 * (or, under prefers-reduced-motion, happens immediately — see
 * prefersReducedMotion below). */
export function RfqsPanel(): ReactElement {
  const { useRfqs, useInstruments, useDealers, useCreditRfqFilterPreference } =
    useViewModel();
  const rfqs = useRfqs();
  const instruments = useInstruments();
  const dealers = useDealers();
  const { filter } = useCreditRfqFilterPreference();
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());
  const [exiting, setExiting] = useState<ReadonlySet<number>>(new Set());
  const [entering, setEntering] = useState<ReadonlyMap<number, number>>(
    new Map(),
  );

  const shown = rfqs
    .filter((r) => {
      return matchesFilter(r.state, filter) && !dismissed.has(r.id);
    })
    .sort((a, b) => {
      return b.creationTimestamp - a.creationTimestamp;
    });
  const shownIds = shown.map((r) => {
    return r.id;
  });
  const shownIdsKey = shownIds.join(",");

  const [prevShown, setPrevShown] = useState<PrevShown>(() => {
    return { key: shownIdsKey, ids: new Set(shownIds) };
  });
  const [prevFilter, setPrevFilter] = useState(filter);
  const shownChanged = shownIdsKey !== prevShown.key;
  const filterChanged = filter !== prevFilter;

  // React's sanctioned "adjust state during render" pattern (see
  // react.dev's "You Might Not Need an Effect"): recompute the entrance
  // cascade the instant the shown-id set or the active filter changes, and
  // fold the previous-render snapshots forward. This can never loop — the
  // branch only runs while the derived snapshots disagree with this
  // render's inputs, and it always ends that render by matching them.
  if (shownChanged || filterChanged) {
    if (!prefersReducedMotion()) {
      const additions = enterCascadeAdditions({
        prevShownIds: prevShown.ids,
        shownIds,
        filterChanged,
      });

      if (additions.size > 0) {
        const merged = new Map(entering);
        additions.forEach((delay, id) => {
          merged.set(id, delay);
        });
        setEntering(merged);
      }
    }

    if (shownChanged)
      setPrevShown({ key: shownIdsKey, ids: new Set(shownIds) });
    if (filterChanged) setPrevFilter(filter);
  }

  const { register } = useFlipGrid([filter, shownIdsKey]);

  function handleRemove(rfqId: number): void {
    if (prefersReducedMotion()) {
      setDismissed((prev) => {
        return new Set(prev).add(rfqId);
      });
      return;
    }

    setExiting((prev) => {
      return new Set(prev).add(rfqId);
    });
  }

  function handleCardAnimationEnd(rfqId: number, kind: "enter" | "exit"): void {
    if (kind === "enter") {
      setEntering((prev) => {
        if (!prev.has(rfqId)) return prev;
        const next = new Map(prev);
        next.delete(rfqId);
        return next;
      });
      return;
    }

    setExiting((prev) => {
      if (!prev.has(rfqId)) return prev;
      const next = new Set(prev);
      next.delete(rfqId);
      return next;
    });
    setDismissed((prev) => {
      return new Set(prev).add(rfqId);
    });
  }

  return (
    <div className={styles.panel}>
      <div className={styles.body}>
        {shown.length === 0 ? (
          <EmptyRfqs />
        ) : (
          <div className={styles.grid}>
            {shown.map((rfq) => {
              return (
                <div
                  key={rfq.id}
                  ref={register(String(rfq.id))}
                  className={styles.cell}
                >
                  <RfqCardCell
                    rfq={rfq}
                    instruments={instruments}
                    dealers={dealers}
                    anim={cardAnim(exiting.has(rfq.id), entering.has(rfq.id))}
                    delayMs={entering.get(rfq.id) ?? 0}
                    onRemove={handleRemove}
                    onAnimationEnd={handleCardAnimationEnd}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface PrevShown {
  key: string;
  ids: ReadonlySet<number>;
}

function matchesFilter(state: RfqState, filter: CreditRfqFilter): boolean {
  switch (filter) {
    case "live":
      return state === RfqState.Open;
    case "closed":
      return state !== RfqState.Open;
    case "all":
      return true;
  }
}

/** Same matchMedia seam BootGate/BootSequence/useFlipGrid already consult
 * (jsdom omits window.matchMedia entirely, so this defaults to false — i.e.
 * motion IS considered active — in every contract spec that doesn't stub
 * it via vi.stubGlobal). */
function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

interface RfqCardCellProps {
  rfq: Rfq;
  instruments: readonly Instrument[];
  dealers: readonly Dealer[];
  anim: CardAnim;
  delayMs: number;
  onRemove: (rfqId: number) => void;
  onAnimationEnd: (rfqId: number, kind: "enter" | "exit") => void;
}

function RfqCardCell(props: RfqCardCellProps): ReactElement {
  const { rfq, instruments, dealers, anim, delayMs, onRemove, onAnimationEnd } =
    props;
  const { useQuotesForRfq, useAcceptQuote, useCancelRfq } = useViewModel();
  const quotes = useQuotesForRfq(rfq.id);
  const acceptQuote = useAcceptQuote();
  const cancelRfq = useCancelRfq();
  const vm = rfqCardVm(rfq, quotes, instruments, dealers);

  function handleAccept(quoteId: number): void {
    void acceptQuote(quoteId);
  }

  function handleCancel(): void {
    void cancelRfq(rfq.id);
  }

  function handleRemove(): void {
    onRemove(rfq.id);
  }

  function handleAnimationEnd(kind: "enter" | "exit"): void {
    onAnimationEnd(rfq.id, kind);
  }

  return (
    <RfqCard
      vm={vm}
      creationTimestamp={rfq.creationTimestamp}
      expirySecs={rfq.expirySecs}
      anim={anim}
      delayMs={delayMs}
      onAccept={handleAccept}
      onCancel={handleCancel}
      onRemove={handleRemove}
      onAnimationEnd={handleAnimationEnd}
    />
  );
}
