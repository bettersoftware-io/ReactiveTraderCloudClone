import type { JSX } from "solid-js";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
  untrack,
} from "solid-js";

import {
  type CreditRfqFilter,
  type Dealer,
  type Instrument,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { useFlipGrid } from "#/ui/shell/motion/useFlipGrid";

import { EmptyRfqs } from "./EmptyRfqs";
import { RfqCard } from "./RfqCard";
import { type CardAnim, cardAnim, enterCascadeAdditions } from "./rfqCardAnim";
import { type RfqCardVm, rfqCardVm } from "./rfqCardVm";

import styles from "./RfqsPanel.module.css";

/** PROTO Rfqs/RfqsPanel.tsx: the RFQs panel — a FLIP-glided grid of RfqCards
 * (or the empty state when the active filter matches nothing). The active
 * filter (LIVE/CLOSED/ALL) lives behind the shared useCreditRfqFilterPreference
 * seam — this panel only READS it; RfqsHead's filter pills write it, the
 * same head/body split LiveRatesHead/LiveRatesPanel use for viewMode.
 *
 * Entrance/exit/tab-switch-cascade animation (PROTO isNew/tabRecent/
 * exitingRfqs/exitAt) is re-derived client-side without a clock: `entering`/
 * `exiting` are plain id-keyed maps, computed by diffing the rfq-id sets
 * across emissions (see rfqCardAnim.ts) via a bookkeeping `createEffect` —
 * the Solid analogue of React's "adjust state during render" pattern (the
 * effect is keyed off the narrowed id-set/filter memos below, per the
 * reactivity amendment, never a raw whole-state accessor) — and cleared via
 * each card's own `onAnimationEnd` — src/ui may not schedule timers or read
 * the wall clock (grep-gates.ts gate 29), so there is no fixed-ms flash/
 * retain window the way the prototype's hook has one; the retain window is
 * instead exactly the CSS exit animation's own duration. Two exit flavours
 * share the machinery, distinguished by ExitReason: "remove" (trash click —
 * dismissed for good once the animation ends) and "auto" (the RFQ left the
 * active filter via a STATE change, e.g. Open→Expired while viewing LIVE —
 * retained mid-animation, then simply no longer rendered; switching to
 * CLOSED shows it again). Under prefers-reduced-motion both flavours skip
 * the animation entirely.
 *
 * SOLID PORT NOTE: the card grid is keyed by rfq id (`<For each={ids}>`,
 * looking the current Rfq up inside each item), not by the Rfq object
 * itself — a state transition (Open→Closed/Expired) is a fresh Rfq
 * reference for the SAME logical RFQ, and `<For>` keys by value identity;
 * iterating the object array directly would tear down and remount the
 * card (losing its in-flight exit animation and FLIP registration) on
 * every state change, exactly the "reference-keying tears down live DOM
 * mid-interaction" trap `<Index>`/id-keying exists to avoid (see
 * InhouseLayoutEngine.tsx) — except here the LIST ITSELF also grows/shrinks
 * (new RFQs arrive, dismissed ones leave), so `<Index>` (position-keying)
 * would be equally wrong; id-keying is the correct middle ground, the
 * direct analogue of React's `key={rfq.id}`. */
export function RfqsPanel(): JSX.Element {
  const { useRfqs, useInstruments, useDealers, useCreditRfqFilterPreference } =
    useViewModel();
  const rfqs = useRfqs();
  const instruments = useInstruments();
  const dealers = useDealers();
  const { filter } = useCreditRfqFilterPreference();

  const [dismissed, setDismissed] = createSignal<ReadonlySet<number>>(
    new Set(),
  );
  const [exiting, setExiting] = createSignal<ReadonlyMap<number, ExitReason>>(
    new Map(),
  );
  const [entering, setEntering] = createSignal<ReadonlyMap<number, number>>(
    new Map(),
  );

  const allIds = createMemo((): number[] => {
    return rfqs().map((r) => {
      return r.id;
    });
  });
  const allIdsKey = createMemo((): string => {
    return allIds().join(",");
  });
  const matchingIds = createMemo((): number[] => {
    const currentDismissed = dismissed();
    return rfqs()
      .filter((r) => {
        return matchesFilter(r.state, filter()) && !currentDismissed.has(r.id);
      })
      .map((r) => {
        return r.id;
      });
  });
  const matchingKey = createMemo((): string => {
    return matchingIds().join(",");
  });

  // Previous-emission snapshots (react's useState comparisons), kept as
  // plain mutable bindings rather than signals: nothing outside the
  // bookkeeping effect below ever reads them, so exposing them reactively
  // would only invite the effect to re-trigger on its own writes.
  let prevAll: IdSnapshot = { key: allIdsKey(), ids: new Set(allIds()) };
  let prevMatching: IdSnapshot = {
    key: matchingKey(),
    ids: new Set(matchingIds()),
  };
  let prevFilter = filter();

  // React's sanctioned "adjust state during render" pattern (react.dev's
  // "You Might Not Need an Effect"), ported to an explicit Solid effect keyed
  // off the narrowed id-set/filter memos above. `exiting`/`entering` are read
  // via `untrack` where this effect needs their CURRENT value for its own
  // bookkeeping — never tracked — so writing to them here can't re-trigger
  // this same effect; it only re-runs when allIdsKey/matchingKey/filter
  // actually change again.
  createEffect(() => {
    const currentAllKey = allIdsKey();
    const currentMatchingKey = matchingKey();
    const currentFilter = filter();

    const allChanged = currentAllKey !== prevAll.key;
    const matchingChanged = currentMatchingKey !== prevMatching.key;
    const filterChanged = currentFilter !== prevFilter;
    const inputsChanged = allChanged || matchingChanged || filterChanged;

    if (!inputsChanged) {
      return;
    }

    const reduced = prefersReducedMotion();
    const currentAllIds = allIds();
    const currentMatchingIdSet = new Set(matchingIds());
    const currentDismissed = dismissed();

    // Auto-exit grace (PROTO exitAt/EXITING_RETAIN_MS): an id that dropped
    // out of the MATCHING set without a filter change (a state transition,
    // e.g. an RFQ expiring while LIVE is the active tab) is retained in
    // `exiting` so its card can play the cardOut animation before it stops
    // rendering. A filter change never auto-exits — the outgoing tab's
    // cards are simply replaced (matching the prototype, which only retains
    // state-transition and trash-click exits across the swap).
    let exitingNow = untrack(exiting);

    if (!reduced && matchingChanged && !filterChanged) {
      const allIdSet = new Set(currentAllIds);
      const dropped = [...prevMatching.ids].filter((id) => {
        return (
          !currentMatchingIdSet.has(id) &&
          allIdSet.has(id) &&
          !currentDismissed.has(id) &&
          !exitingNow.has(id)
        );
      });

      if (dropped.length > 0) {
        const merged = new Map(exitingNow);

        for (const id of dropped) {
          merged.set(id, "auto");
        }

        exitingNow = merged;
        setExiting(merged);
      }
    }

    // Rendered = matches the active filter, plus anything mid exit
    // animation; user-dismissed ids are gone for good. Mirrors the
    // `rendered` memo below exactly.
    const renderedIdsNow = rfqs()
      .filter((r) => {
        return (
          !currentDismissed.has(r.id) &&
          (matchesFilter(r.state, currentFilter) || exitingNow.has(r.id))
        );
      })
      .sort((a, b) => {
        return b.creationTimestamp - a.creationTimestamp;
      })
      .map((r) => {
        return r.id;
      });

    // Prune any `entering` id that's no longer rendered (final review M-b):
    // a card created under one filter gets an `entering` entry; if the user
    // switches filters before its 0.46s entrance completes, the card
    // unmounts without ever firing animationend, so nothing would otherwise
    // clear its entry — orphaned in the map. If that same id later
    // re-enters the rendered set via a STATE change with the filter
    // unchanged (which shows plain, no entrance — enterCascadeAdditions
    // deliberately omits it), the stale entry would incorrectly replay the
    // entrance. Dropping ids the moment they leave `rendered` (same pass
    // that computes the new additions) keeps `entering` in sync with what's
    // actually mounted.
    const renderedIdSet = new Set(renderedIdsNow);
    const mergedEntering = new Map(untrack(entering));
    let enteringChanged = false;

    for (const id of mergedEntering.keys()) {
      if (!renderedIdSet.has(id)) {
        mergedEntering.delete(id);
        enteringChanged = true;
      }
    }

    if (!reduced) {
      const additions = enterCascadeAdditions({
        prevAllIds: prevAll.ids,
        shownIds: renderedIdsNow,
        filterChanged,
      });

      if (additions.size > 0) {
        additions.forEach((delay, id) => {
          mergedEntering.set(id, delay);
        });
        enteringChanged = true;
      }
    }

    if (enteringChanged) {
      setEntering(mergedEntering);
    }

    prevAll = { key: currentAllKey, ids: new Set(currentAllIds) };
    prevMatching = { key: currentMatchingKey, ids: currentMatchingIdSet };
    prevFilter = currentFilter;
  });

  // Rendered = matches the active filter, plus anything mid exit animation;
  // user-dismissed ids are gone for good. Always reflects the CURRENT
  // `exiting`/`dismissed` signals, including any write the bookkeeping
  // effect above just made in this same pass.
  const rendered = createMemo((): Rfq[] => {
    const currentFilter = filter();
    const currentDismissed = dismissed();
    const currentExiting = exiting();

    return rfqs()
      .filter((r) => {
        return (
          !currentDismissed.has(r.id) &&
          (matchesFilter(r.state, currentFilter) || currentExiting.has(r.id))
        );
      })
      .sort((a, b) => {
        return b.creationTimestamp - a.creationTimestamp;
      });
  });
  const renderedIds = createMemo((): number[] => {
    return rendered().map((r) => {
      return r.id;
    });
  });
  const renderedIdsKey = createMemo((): string => {
    return renderedIds().join(",");
  });

  const { register } = useFlipGrid(() => {
    return [filter(), renderedIdsKey()];
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

    const reason = untrack(exiting).get(rfqId);
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
    <div class={styles.panel}>
      <div class={styles.body}>
        <Show when={renderedIds().length > 0} fallback={<EmptyRfqs />}>
          <div class={styles.grid}>
            <For each={renderedIds()}>
              {(rfqId: number) => {
                const setEl = register(String(rfqId));
                onCleanup(() => {
                  setEl(null);
                });
                // `rfqId` is drawn from `renderedIds()`, which is
                // `rendered().map(r => r.id)` — the lookup below always
                // succeeds; `rendered()` is a memo, so both calls read the
                // same cached value within one reactive update. `<Show keyed>`
                // narrows `Rfq | undefined` to `Rfq` without a non-null
                // assertion.
                const rfq = createMemo((): Rfq | undefined => {
                  return rendered().find((r) => {
                    return r.id === rfqId;
                  });
                });

                return (
                  <div ref={setEl} class={styles.cell}>
                    <Show when={rfq()} keyed>
                      {(currentRfq: Rfq) => {
                        return (
                          <RfqCardCell
                            rfq={currentRfq}
                            instruments={instruments()}
                            dealers={dealers()}
                            anim={cardAnim(
                              exiting().has(rfqId),
                              entering().has(rfqId),
                            )}
                            delayMs={entering().get(rfqId) ?? 0}
                            onRemove={handleRemove}
                            onAnimationEnd={handleCardAnimationEnd}
                          />
                        );
                      }}
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
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

function RfqCardCell(props: RfqCardCellProps): JSX.Element {
  const { useQuotesForRfq, useAcceptQuote, useCancelRfq } = useViewModel();
  const quotes = useQuotesForRfq(props.rfq.id);
  const acceptQuote = useAcceptQuote();
  const cancelRfq = useCancelRfq();
  const vm = createMemo((): RfqCardVm => {
    return rfqCardVm(props.rfq, quotes(), props.instruments, props.dealers);
  });

  function handleAccept(quoteId: number): void {
    void acceptQuote(quoteId);
  }

  function handleCancel(): void {
    void cancelRfq(props.rfq.id);
  }

  function handleRemove(): void {
    props.onRemove(props.rfq.id);
  }

  function handleAnimationEnd(kind: "enter" | "exit"): void {
    props.onAnimationEnd(props.rfq.id, kind);
  }

  return (
    <RfqCard
      vm={vm()}
      creationTimestamp={props.rfq.creationTimestamp}
      expirySecs={props.rfq.expirySecs}
      anim={props.anim}
      delayMs={props.delayMs}
      onAccept={handleAccept}
      onCancel={handleCancel}
      onRemove={handleRemove}
      onAnimationEnd={handleAnimationEnd}
    />
  );
}
