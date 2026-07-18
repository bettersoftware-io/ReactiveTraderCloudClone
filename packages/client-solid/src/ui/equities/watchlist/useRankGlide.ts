import {
  type Accessor,
  createEffect,
  createSignal,
  on,
  onMount,
} from "solid-js";

import {
  coalesceOrder,
  computeRankDirections,
  FALLBACK_ROW_HEIGHT,
  GLIDE_DUR_MS,
  GLIDE_EASING,
  HIGHLIGHT_DUR_MS,
  HIGHLIGHT_EASING,
  type RankDirection,
  REDUCED_MOTION_QUERY,
  sameOrder,
} from "@rtc/motion-core";

// Watchlist-only rank glide (ported from client-prototype's Watchlist/useRankGlide.ts,
// itself PROTO dc.html ~879-892): unlike the generic FLIP glide in
// useFlipGrid.ts (translate only, keyed on DOM position deltas), a re-sorted
// watchlist row also plays a direction-colored highlight pulse — green if the
// row rose in rank, red if it fell. Rows recycle by index while the *data*
// reorders, so the glide has to be driven from rank deltas (index in `order`
// vs the previous render's index) rather than measured positions.
//
// I4 fix (rank-glide churn): the default "chg" sort re-sorts from up to six
// INDEPENDENT 500ms quote streams, each triggering a candidate reorder — up to
// ~12 candidate reorders/sec against a 560ms glide. Committing every one of
// those (re-rendering rows in the new order AND kicking off a fresh WAAPI
// glide) starts overlapping animations and corrupts rowHeight()'s mid-glide
// measurement — rows visibly stack/overlap. The hook COALESCES: only ONE
// order is "committed" (and returned, for the caller to actually render/key
// off) per glide window — see `coalesceOrder` (imported from `@rtc/motion-core`)
// and its use in the effect.

// Exported so the length<2 fallback is directly unit-testable (see
// useRankGlide.test.ts) — a real DOM/effect scenario can't exercise it, since
// there's nothing to glide (and so no committed-order change to trigger the
// effect at all) with fewer than two rows.
export function rowHeight(nodes: HTMLElement[]): number {
  if (nodes.length < 2) {
    return FALLBACK_ROW_HEIGHT;
  }

  // `nodes.length >= 2` here, so indices 0/1 are always in range.
  const delta =
    nodes[1].getBoundingClientRect().top - nodes[0].getBoundingClientRect().top;

  return delta || FALLBACK_ROW_HEIGHT;
}

// playGlide/playHighlight return the live Animation (or undefined when
// Element.animate isn't available, e.g. jsdom) so the caller can await
// `.finished` and know when it's safe to apply a buffered reorder — that's
// the I4 coalescing gate's only signal that a glide is still in flight.

function playGlide(node: HTMLElement, dy: number): Animation | undefined {
  try {
    return node.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
      { duration: GLIDE_DUR_MS, easing: GLIDE_EASING },
    );
  } catch {
    // jsdom doesn't implement Element.animate — skip the glide.
    return undefined;
  }
}

function playHighlight(
  node: HTMLElement,
  direction: RankDirection,
): Animation | undefined {
  // The direction-coloured shadow is BAKED in CSS on a per-row overlay span
  // (WatchlistRow.module.css .rankGlow, colour picked by data-rank-dir) and
  // only the overlay's OPACITY animates: box-shadow keyframes can never run
  // on the compositor, and under the default "chg" sort a re-sort commits
  // every glide window — the previous box-shadow WAAPI animation kept the
  // main thread re-resolving style at full frame rate for the whole tab
  // (and dragged the composited glide transform down with it,
  // kTargetHasIncompatibleAnimations).
  const glow = node.querySelector<HTMLElement>("[data-rank-glow]");

  if (!glow) {
    return undefined;
  }

  node.dataset.rankDir = direction;

  try {
    return glow.animate(
      [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.3 },
        { opacity: 0, offset: 1 },
      ],
      { duration: HIGHLIGHT_DUR_MS, easing: HIGHLIGHT_EASING },
    );
  } catch {
    // jsdom doesn't implement Element.animate — skip the highlight.
    return undefined;
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

/** Glides each `[data-watch-sym]` row keyed under `root()` from its previous
 * rank to its current one, with a direction-colored highlight pulse, and
 * returns an accessor for the order the caller should actually RENDER rows
 * in (the "committed" order) — the caller must key/iterate off this return
 * value, not the raw `candidate()` it passed in, so the DOM's physical row
 * order never jumps ahead of what the glide is animating from/to.
 *
 * Candidates arriving while a glide is still in flight (WAAPI animations not
 * yet `.finished`) are coalesced: only the LATEST is buffered and applied the
 * moment the current glide settles, so a burst of quote-driven re-sorts
 * (~12/sec under the default "chg" sort) collapses into at most one reorder
 * per glide window instead of restarting overlapping animations (I4 fix).
 * No-ops under reduced motion, under power-saver's Freeze tier
 * (`options.freeze`, since the CSS catch-all can't reach raw
 * `Element.animate()`), or before a previous rank has been recorded (the
 * first run never glides).
 *
 * SOLID PORT NOTE: both `root` and `candidate` are THUNKS, mirroring
 * useFlipGrid's `deps` thunk — Solid components run their setup body once, so
 * a plain ref/array captured at the call site would freeze at mount. Passing
 * accessors lets the effects below re-read the caller's current ref/array
 * fresh every run. `options.freeze` follows the same accessor shape for the
 * same reason (see useFlipGrid's doc comment) — a plain boolean captured at
 * the call site would never see a later power-saver toggle. */
export function useRankGlide(
  root: Accessor<HTMLElement | null>,
  candidate: Accessor<readonly string[]>,
  options: UseRankGlideOptions = {},
): Accessor<readonly string[]> {
  const { freeze } = options;
  let prevRank: Record<string, number> | undefined;
  let gliding = false;
  let pending: readonly string[] | null = null;
  const [committed, setCommitted] = createSignal<readonly string[]>(
    candidate(),
  );

  // Decide whether to commit `candidate()` now or buffer it — runs whenever
  // `candidate()` changes. A change is either committed now (idle) or
  // buffered until the in-flight glide settles (see the glide effect's
  // `.finished` handling below) — that's what coalesces a burst of rapid
  // candidates into at most one reorder per glide window (I4 fix).
  createEffect(
    on(candidate, (current) => {
      if (sameOrder(current, committed())) {
        return;
      }

      const decision = coalesceOrder(committed(), pending, current, gliding);

      pending = decision.bufferedPending;

      if (!sameOrder(decision.committed, committed())) {
        setCommitted(decision.committed);
      }
    }),
  );

  // Mirrors the React original's useLayoutEffect: keyed on `committed` (not
  // `candidate`) — this effect's whole job is to glide from the PREVIOUS
  // committed order to the current one, so it must fire exactly when
  // `committed` actually changes, never for a candidate that got buffered
  // instead (nothing moved in the DOM yet).
  createEffect(
    on(committed, (order) => {
      const rootEl = root();

      if (rootEl != null) {
        const nodes = Array.from(
          rootEl.querySelectorAll<HTMLElement>("[data-watch-sym]"),
        );
        const animations: Animation[] = [];

        if (
          !prefersReducedMotion() &&
          !(freeze?.() ?? false) &&
          prevRank != null &&
          nodes.length > 0
        ) {
          const directions = computeRankDirections(prevRank, order);
          const rowH = rowHeight(nodes);

          nodes.forEach((node) => {
            // Guaranteed present — `nodes` came from
            // querySelectorAll("[data-watch-sym]"), so every match has the
            // attribute (unlike getAttribute's general `string | null` type).
            const sym = node.getAttribute("data-watch-sym") as string;
            const oldIndex = prevRank?.[sym];
            // Current rank comes from `order`, not DOM position: rows only
            // physically move once Solid reconciles the keyed re-render, but
            // this effect runs before that's guaranteed to have settled.
            const currentIndex = order.indexOf(sym);

            if (
              oldIndex !== undefined &&
              currentIndex !== -1 &&
              oldIndex !== currentIndex
            ) {
              const dy = (oldIndex - currentIndex) * rowH;
              const glideAnim = playGlide(node, dy);

              if (glideAnim) {
                animations.push(glideAnim);
              }

              // `sym` is a member of `order` (currentIndex !== -1 above came
              // from `order.indexOf(sym)`), and computeRankDirections gives
              // every member of `order` an entry — so this is never undefined.
              const highlightAnim = playHighlight(node, directions[sym]);

              if (highlightAnim) {
                animations.push(highlightAnim);
              }
            }
          });
        }

        const nextRank: Record<string, number> = {};
        order.forEach((sym, index) => {
          nextRank[sym] = index;
        });
        prevRank = nextRank;

        // Gate the NEXT commit on these animations settling — jsdom (contract/
        // unit tests) never produces a real Animation here (Element.animate
        // throws, caught above), so `animations` stays empty and gliding never
        // engages there; only a real browser's WAAPI run holds a reorder back.
        if (animations.length > 0) {
          gliding = true;
          void Promise.allSettled(
            animations.map((anim) => {
              return anim.finished;
            }),
          ).then(() => {
            gliding = false;
            const next = pending;

            if (next != null) {
              pending = null;
              setCommitted(next);
            }
          });
        }
      }
    }),
  );

  onMount(() => {
    // No teardown needed: the effects above hold no subscriptions outside
    // Solid's own reactive graph (WAAPI animations settle or get GC'd with
    // their nodes) — this onMount only documents that the hook is meant to be
    // used within a live component tree, mirroring useFlipGrid's ownership.
  });

  return committed;
}

export interface UseRankGlideOptions {
  /** Power-saver "freeze" tier accessor (`usePowerSaver().isFreeze`): when it
   *  reads true, skip the glide/highlight WAAPI pass entirely — rows jump-cut
   *  straight to their new rank. Undefined behaves as `false` so existing
   *  callers are unaffected. */
  freeze?: Accessor<boolean>;
}
