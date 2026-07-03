import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";

// Watchlist-only rank glide (PROTO dc.html ~879-892): unlike the generic FLIP
// glide in useFlip.ts (translate only, keyed on DOM position deltas), a
// re-sorted watchlist row also plays a direction-colored highlight pulse —
// green if the row rose in rank, red if it fell. Rows recycle by index while
// the *data* reorders, so the glide has to be driven from rank deltas (index
// in `order` vs the previous render's index) rather than measured positions.

export type RankDirection = "rose" | "fell" | "unchanged";

const GLIDE_DUR_MS = 560;
const GLIDE_EASING = "cubic-bezier(.34,1.28,.5,1)";
const HIGHLIGHT_DUR_MS = 820;
const HIGHLIGHT_EASING = "ease-out";
const ROSE_COLOR = "rgba(43,255,179,.95)";
const FELL_COLOR = "rgba(255,93,115,.95)";
const FALLBACK_ROW_HEIGHT = 52;

// Pure so it can be exercised directly (jsdom lacks Element.animate, so the
// per-row direction — not whether WAAPI ran — is what tests pin down).
export function computeRankDirections(
  prevRank: Record<string, number> | undefined,
  order: string[],
): Record<string, RankDirection> {
  const directions: Record<string, RankDirection> = {};

  order.forEach((sym, index) => {
    const oldIndex = prevRank?.[sym];

    if (oldIndex === undefined || oldIndex === index) {
      directions[sym] = "unchanged";
    } else {
      directions[sym] = oldIndex > index ? "rose" : "fell";
    }
  });

  return directions;
}

function rowHeight(nodes: HTMLElement[]): number {
  if (nodes.length < 2) {
    return FALLBACK_ROW_HEIGHT;
  }

  const delta =
    nodes[1].getBoundingClientRect().top - nodes[0].getBoundingClientRect().top;

  return delta || FALLBACK_ROW_HEIGHT;
}

function playGlide(node: HTMLElement, dy: number): void {
  try {
    node.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
      { duration: GLIDE_DUR_MS, easing: GLIDE_EASING },
    );
  } catch {
    // jsdom doesn't implement Element.animate — skip the glide (PROTO 887).
  }
}

function playHighlight(node: HTMLElement, direction: RankDirection): void {
  const color = direction === "rose" ? ROSE_COLOR : FELL_COLOR;

  try {
    node.animate(
      [
        { boxShadow: `inset 3px 0 0 ${color},0 0 0 0 ${color}`, offset: 0 },
        {
          boxShadow: `inset 3px 0 0 ${color},0 0 16px -3px ${color}`,
          offset: 0.3,
        },
        {
          boxShadow: "inset 0 0 0 0 transparent,0 0 0 0 transparent",
          offset: 1,
        },
      ],
      { duration: HIGHLIGHT_DUR_MS, easing: HIGHLIGHT_EASING },
    );
  } catch {
    // jsdom doesn't implement Element.animate — skip the highlight (PROTO 888).
  }
}

export function useRankGlide(
  rootRef: RefObject<HTMLElement | null>,
  order: string[],
  reduce = false,
): void {
  const prevRankRef = useRef<Record<string, number> | undefined>(undefined);

  useLayoutEffect(() => {
    const root = rootRef.current;

    if (root != null) {
      const nodes = Array.from(
        root.querySelectorAll<HTMLElement>("[data-watch-sym]"),
      );

      if (!reduce && prevRankRef.current != null && nodes.length > 0) {
        const directions = computeRankDirections(prevRankRef.current, order);
        const rowH = rowHeight(nodes);

        nodes.forEach((node) => {
          const sym = node.getAttribute("data-watch-sym");
          const oldIndex = sym == null ? undefined : prevRankRef.current?.[sym];
          // Current rank comes from `order`, not DOM position: rows only
          // physically move once React reconciles the keyed re-render, but
          // this effect runs before that's guaranteed to have settled.
          const currentIndex = sym == null ? -1 : order.indexOf(sym);

          if (
            sym != null &&
            oldIndex !== undefined &&
            currentIndex !== -1 &&
            oldIndex !== currentIndex
          ) {
            const dy = (oldIndex - currentIndex) * rowH;
            playGlide(node, dy);
            playHighlight(node, directions[sym]);
          }
        });
      }

      const nextRank: Record<string, number> = {};
      order.forEach((sym, index) => {
        nextRank[sym] = index;
      });
      prevRankRef.current = nextRank;
    }
  });
}
