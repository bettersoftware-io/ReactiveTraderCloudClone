/**
 * Pure entrance/exit-cascade math for RfqsPanel's card animations (PROTO
 * useCreditRfqs.ts isNew/tabRecent/exitingRfqs + Rfqs/RfqCard.tsx
 * cardAnim/cardDelayMs), re-derived without a clock: `src/ui` may not use
 * setTimeout/setInterval or Date.now (see tests/scripts/grep-gates.ts gate
 * 29 and the "no rxjs/localStorage/fetch in src/ui" gates) — every timer in
 * this app lives behind the app-layer/ViewModel seam. Instead of the
 * prototype's fixed-ms "isNew for NEW_RFQ_FLASH_MS" / "tabRecent for
 * TAB_RECENT_MS" windows, entrance is a one-shot event derived by diffing
 * the shown-id set across renders, and RfqsPanel clears its bookkeeping via
 * each card's own native `animationend` — synced to the CSS's actual
 * duration rather than a guessed constant.
 */

/** Per-index stagger step for a tab-switch cascade re-entrance, in ms
 * (PROTO STAGGER_STEP_MS). */
export const STAGGER_STEP_MS = 45;

export type CardAnim = "enter" | "exit" | "none";

export interface EnterCascadeInput {
  /** The ids shown immediately before this render's change. */
  readonly prevShownIds: ReadonlySet<number>;
  /** The ids shown by this render, in grid order (index drives the stagger delay). */
  readonly shownIds: readonly number[];
  /** Whether the active filter itself just changed (PROTO tabRecent trigger). */
  readonly filterChanged: boolean;
}

/**
 * The entrance-delay ADDITIONS to merge into RfqsPanel's `entering` map: a
 * brand-new id (absent from `prevShownIds`) enters immediately (0ms — PROTO:
 * a lone new-RFQ arrival never staggers, `cardDelayMs` returns 0 for
 * `isNew`); when the filter itself just changed, every OTHER currently-shown
 * id re-enters staggered by its grid index (PROTO STAGGER_STEP_MS). A new id
 * always wins the 0ms delay even during a filter-change render (matches
 * `cardDelayMs`'s `!isNew` guard). Returns an empty map when neither
 * condition applies to any id.
 */
export function enterCascadeAdditions(
  input: EnterCascadeInput,
): ReadonlyMap<number, number> {
  const { prevShownIds, shownIds, filterChanged } = input;
  const additions = new Map<number, number>();

  shownIds.forEach((id, index) => {
    if (!prevShownIds.has(id)) {
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
  if (isExiting) return "exit";
  if (isEntering) return "enter";
  return "none";
}
