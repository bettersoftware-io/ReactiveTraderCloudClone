import { cleanup, render } from "@solidjs/testing-library";
import { type Accessor, For, flush } from "solid-js";
import { vi } from "vitest";

import { useRankGlide } from "#/ui/equities/watchlist/useRankGlide";

export interface UseRankGlidePage {
  /** Mounts a list of `[data-watch-sym]` rows rendered in `useRankGlide`'s
   * committed order, its root bound the way WatchlistPanel binds it (a plain
   * element variable behind a getter), and returns the symbols of the rows
   * a glide moved, in call order. */
  mount(candidate: Accessor<readonly string[]>): readonly string[];
  unmountAll(): void;
}

/** The framework surface for `useRankGlide.test.ts`. jsdom has no Web
 * Animations API, so the page stands in an `Element.animate` that records the
 * row each translateY glide targets and settles at once. */
export function rankGlidePage(): UseRankGlidePage {
  const restorers: (() => void)[] = [];

  return {
    mount(candidate: Accessor<readonly string[]>): readonly string[] {
      const glided: string[] = [];
      const realAnimate = Element.prototype.animate;

      Element.prototype.animate = vi.fn(function recordGlide(
        this: Element,
        keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      ): Animation {
        const sym = this.getAttribute("data-watch-sym");

        if (sym !== null && JSON.stringify(keyframes).includes("translateY")) {
          glided.push(sym);
        }

        return { finished: Promise.resolve() } as unknown as Animation;
      });
      restorers.push(() => {
        Element.prototype.animate = realAnimate;
      });

      function RankedList(): ReturnType<typeof For> {
        let listEl: HTMLDivElement | undefined;
        const committed = useRankGlide(() => {
          return listEl ?? null;
        }, candidate);

        return (
          <div
            ref={(el: HTMLDivElement): void => {
              listEl = el;
            }}
          >
            <For each={committed()}>
              {(sym: string) => {
                return (
                  <div data-watch-sym={sym}>
                    <span data-rank-glow="true" />
                  </div>
                );
              }}
            </For>
          </div>
        );
      }

      render(() => {
        return <RankedList />;
      });
      flush();

      return glided;
    },
    unmountAll(): void {
      cleanup();

      for (const restore of restorers.splice(0)) {
        restore();
      }
    },
  };
}
