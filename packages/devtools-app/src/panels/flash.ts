import { type RefObject, useEffect } from "react";

/** Retrigger a compositor-safe opacity flash on a span WITHOUT remounting it,
 * each time `lastSeq` advances past 0. WAAPI promotes the element only for
 * the animation's lifetime, so there is no permanent will-change layer
 * (docs/performance.md). Shared by StateTreePanel and NavTree — the helper
 * spec §3.1 of the store-first design assumed. */
export function useFlashOnSeq(
  flashRef: RefObject<HTMLSpanElement | null>,
  lastSeq: number,
): void {
  useEffect((): void => {
    if (lastSeq > 0) {
      flashRef.current?.animate([{ opacity: 0.35 }, { opacity: 1 }], {
        duration: 300,
        easing: "ease-out",
      });
    }
  }, [flashRef, lastSeq]);
}
