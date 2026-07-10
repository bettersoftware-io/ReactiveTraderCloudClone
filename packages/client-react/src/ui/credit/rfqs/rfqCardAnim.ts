/**
 * Pure entrance/exit-cascade math for RfqsPanel's card animations (PROTO
 * useCreditRfqs.ts isNew/tabRecent/exitingRfqs + Rfqs/RfqCard.tsx
 * cardAnim/cardDelayMs), re-derived without a clock: `src/ui` may not
 * schedule timers or read the wall clock (tests/scripts/grep-gates.ts gate
 * 29 and the other src/ui purity gates — no rxjs, browser storage, or
 * network either) — every timer in this app lives behind the app-layer/
 * ViewModel seam. Instead of the prototype's fixed-ms "isNew for
 * NEW_RFQ_FLASH_MS" / "tabRecent for TAB_RECENT_MS" windows, entrance is a
 * one-shot event derived by diffing the rfq-id sets across renders, and
 * RfqsPanel clears its bookkeeping via each card's own native
 * `animationend` — synced to the CSS's actual duration rather than a
 * guessed constant.
 */

/** Per-index stagger step for a tab-switch cascade re-entrance, in ms
 * (PROTO STAGGER_STEP_MS). */
export const STAGGER_STEP_MS = 45;

export type CardAnim = "enter" | "exit" | "none";

export interface EnterCascadeInput {
  /** ALL rfq ids from the previous render — UNFILTERED. "Just created" is
   * absence from this set; the filtered shown-set can't distinguish a
   * created RFQ from one a filter switch or state change merely REVEALED. */
  readonly prevAllIds: ReadonlySet<number>;
  /** The ids shown by this render, in grid order (index drives the stagger delay). */
  readonly shownIds: readonly number[];
  /** Whether the active filter itself just changed (PROTO tabRecent trigger). */
  readonly filterChanged: boolean;
}

/**
 * The entrance-delay ADDITIONS to merge into RfqsPanel's `entering` map
 * (PROTO cardAnim/cardDelayMs semantics):
 * - a genuinely just-CREATED id (absent from the previous UNFILTERED id set)
 *   enters immediately — 0ms, never staggered (`cardDelayMs` returns 0 for
 *   `isNew`, even mid tab-cascade);
 * - when the filter itself just changed, EVERY shown id — survivors and
 *   filter-revealed alike (a disjoint live→closed switch reveals an entirely
 *   different id set, and they all cascade) — re-enters staggered by its
 *   grid index (PROTO STAGGER_STEP_MS);
 * - an id revealed only by a STATE change while the filter is unchanged
 *   (e.g. Open→Expired seen from CLOSED) gets NO entrance — the prototype
 *   shows it plain.
 * Returns an empty map when nothing qualifies.
 */
export function enterCascadeAdditions(
  input: EnterCascadeInput,
): ReadonlyMap<number, number> {
  const { prevAllIds, shownIds, filterChanged } = input;
  const additions = new Map<number, number>();

  shownIds.forEach((id, index) => {
    const created = !prevAllIds.has(id);

    if (created) {
      additions.set(id, 0);
    } else if (filterChanged) {
      additions.set(id, index * STAGGER_STEP_MS);
    }
  });

  return additions;
}

/** The card's data-anim value (PROTO cardAnim): an in-flight exit always
 * wins over an in-flight entrance — a card can be dismissed mid-cascade. */
export function cardAnim(isExiting: boolean, isEntering: boolean): CardAnim {
  if (isExiting) {
    return "exit";
  }

  if (isEntering) {
    return "enter";
  }

  return "none";
}
