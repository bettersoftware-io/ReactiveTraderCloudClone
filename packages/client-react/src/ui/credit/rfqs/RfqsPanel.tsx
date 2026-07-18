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
 * exitingRfqs/exitAt) is re-derived client-side without a clock: `entering`/
 * `exiting` are plain id-keyed maps, computed by diffing the rfq-id sets
 * across renders (see rfqCardAnim.ts) via React's "adjust state during
 * render" pattern, and cleared via each card's own `onAnimationEnd` — src/ui
 * may not schedule timers or read the wall clock (grep-gates.ts gate 29), so
 * there is no fixed-ms flash/retain window the way the prototype's hook has
 * one; the retain window is instead exactly the CSS exit animation's own
 * duration. Two exit flavours share the machinery, distinguished by
 * ExitReason: "remove" (trash click — dismissed for good once the animation
 * ends) and "auto" (the RFQ left the active filter via a STATE change, e.g.
 * Open→Expired while viewing LIVE — retained mid-animation, then simply no
 * longer rendered; switching to CLOSED shows it again). Under
 * prefers-reduced-motion both flavours skip the animation entirely. */
export function RfqsPanel(): ReactElement {
  const {
    useRfqs,
    useInstruments,
    useDealers,
    useCreditRfqFilterPreference,
    usePowerSaver,
  } = useViewModel();
  const rfqs = useRfqs();
  const instruments = useInstruments();
  const dealers = useDealers();
  const { filter } = useCreditRfqFilterPreference();
  const { isFreeze } = usePowerSaver();
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());
  const [exiting, setExiting] = useState<ReadonlyMap<number, ExitReason>>(
    new Map(),
  );

  const [entering, setEntering] = useState<ReadonlyMap<number, number>>(
    new Map(),
  );

  const allIds = rfqs.map((r) => {
    return r.id;
  });
  const allIdsKey = allIds.join(",");
  const matching = rfqs.filter((r) => {
    return matchesFilter(r.state, filter) && !dismissed.has(r.id);
  });

  const matchingIdSet = new Set(
    matching.map((r) => {
      return r.id;
    }),
  );
  const matchingKey = [...matchingIdSet].join(",");

  const [prevAll, setPrevAll] = useState<IdSnapshot>(() => {
    return { key: allIdsKey, ids: new Set(allIds) };
  });

  const [prevMatching, setPrevMatching] = useState<IdSnapshot>(() => {
    return { key: matchingKey, ids: matchingIdSet };
  });
  const [prevFilter, setPrevFilter] = useState(filter);
  const allChanged = allIdsKey !== prevAll.key;
  const matchingChanged = matchingKey !== prevMatching.key;
  const filterChanged = filter !== prevFilter;
  const inputsChanged = allChanged || matchingChanged || filterChanged;
  const reduced = inputsChanged && prefersReducedMotion();

  // React's sanctioned "adjust state during render" pattern (see react.dev's
  // "You Might Not Need an Effect"): react to id-set/filter changes the
  // instant they render, folding the previous-render snapshots forward. This
  // can never loop — the branches only run while the snapshots disagree with
  // this render's inputs, and they always end that render by matching them.
  //
  // Auto-exit grace (PROTO exitAt/EXITING_RETAIN_MS): an id that dropped out
  // of the MATCHING set without a filter change (a state transition, e.g. an
  // RFQ expiring while LIVE is the active tab) is retained in `exiting` so
  // its card can play the cardOut animation before it stops rendering. A
  // filter change never auto-exits — the outgoing tab's cards are simply
  // replaced (matching the prototype, which only retains state-transition
  // and trash-click exits across the swap).
  let exitingNow = exiting;

  if (inputsChanged && !reduced && matchingChanged && !filterChanged) {
    const allIdSet = new Set(allIds);
    const dropped = [...prevMatching.ids].filter((id) => {
      return (
        !matchingIdSet.has(id) &&
        allIdSet.has(id) &&
        !dismissed.has(id) &&
        !exiting.has(id)
      );
    });

    if (dropped.length > 0) {
      const merged = new Map(exiting);

      for (const id of dropped) {
        merged.set(id, "auto");
      }

      exitingNow = merged;
      setExiting(merged);
    }
  }

  // Rendered = matches the active filter, plus anything mid exit animation;
  // user-dismissed ids are gone for good.
  const rendered = rfqs
    .filter((r) => {
      return (
        !dismissed.has(r.id) &&
        (matchesFilter(r.state, filter) || exitingNow.has(r.id))
      );
    })
    .sort((a, b) => {
      return b.creationTimestamp - a.creationTimestamp;
    });

  const renderedIds = rendered.map((r) => {
    return r.id;
  });
  const renderedIdsKey = renderedIds.join(",");

  if (inputsChanged) {
    // Prune any `entering` id that's no longer rendered (final review M-b):
    // a card created under one filter gets an `entering` entry; if the user
    // switches filters before its 0.46s entrance completes, the card
    // unmounts without ever firing animationend, so nothing would otherwise
    // clear its entry — orphaned in the map. If that same id later
    // re-enters the rendered set via a STATE change with the filter
    // unchanged (which shows plain, no entrance — enterCascadeAdditions
    // deliberately omits it), the stale entry would incorrectly replay the
    // entrance. Dropping ids the moment they leave `rendered` (same
    // "adjust state during render" pass that computes the new additions)
    // keeps `entering` in sync with what's actually mounted.
    const renderedIdSet = new Set(renderedIds);
    const merged = new Map(entering);
    let enteringChanged = false;

    for (const id of merged.keys()) {
      if (!renderedIdSet.has(id)) {
        merged.delete(id);
        enteringChanged = true;
      }
    }

    if (!reduced) {
      const additions = enterCascadeAdditions({
        prevAllIds: prevAll.ids,
        shownIds: renderedIds,
        filterChanged,
      });

      if (additions.size > 0) {
        additions.forEach((delay, id) => {
          merged.set(id, delay);
        });
        enteringChanged = true;
      }
    }

    if (enteringChanged) {
      setEntering(merged);
    }

    if (allChanged) {
      setPrevAll({ key: allIdsKey, ids: new Set(allIds) });
    }

    if (matchingChanged) {
      setPrevMatching({ key: matchingKey, ids: matchingIdSet });
    }

    if (filterChanged) {
      setPrevFilter(filter);
    }
  }

  const { register } = useFlipGrid([filter, renderedIdsKey], {
    freeze: isFreeze,
  });

  function handleRemove(rfqId: number): void {
    if (prefersReducedMotion()) {
      setDismissed((prev) => {
        return new Set(prev).add(rfqId);
      });
      return;
    }

    setExiting((prev) => {
      // A trash click upgrades an in-flight auto-exit: either way the user
      // asked for this card gone, so the animation now ends in a dismissal.
      const next = new Map(prev);
      next.set(rfqId, "remove");
      return next;
    });
  }

  function handleCardAnimationEnd(rfqId: number, kind: "enter" | "exit"): void {
    if (kind === "enter") {
      setEntering((prev) => {
        if (!prev.has(rfqId)) {
          return prev;
        }

        const next = new Map(prev);
        next.delete(rfqId);
        return next;
      });
      return;
    }

    const reason = exiting.get(rfqId);
    setExiting((prev) => {
      if (!prev.has(rfqId)) {
        return prev;
      }

      const next = new Map(prev);
      next.delete(rfqId);
      return next;
    });
    setEntering((prev) => {
      if (!prev.has(rfqId)) {
        return prev;
      }

      const next = new Map(prev);
      next.delete(rfqId);
      return next;
    });

    if (reason === "remove") {
      setDismissed((prev) => {
        return new Set(prev).add(rfqId);
      });
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.body}>
        {rendered.length === 0 ? (
          <EmptyRfqs />
        ) : (
          <div className={styles.grid}>
            {rendered.map((rfq) => {
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
                    anim={cardAnim(
                      exitingNow.has(rfq.id),
                      entering.has(rfq.id),
                    )}
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

/** Why a card is playing its exit animation: a trash click ("remove",
 * dismissed for good on animationend) or a state transition that pushed it
 * out of the active filter ("auto", merely stops rendering). */
type ExitReason = "remove" | "auto";

interface IdSnapshot {
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
