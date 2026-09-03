import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";

import { useFlashOnSeq } from "#/panels/flash";

interface HookProps {
  lastSeq: number;
}

export interface FlashHookPage {
  advanceSeq(lastSeq: number): void;
}

/** The framework surface for `flash.test.tsx` (the `useFlashOnSeq` hook, not
 * the `StateTreePanel`-mounting sibling of the same name under
 * `panels/__tests__/`). */
export function flashHookPage(): FlashHookPage {
  const flashRef: RefObject<HTMLSpanElement | null> = {
    current: document.createElement("span"),
  };

  const { rerender } = renderHook(
    ({ lastSeq }: HookProps) => {
      useFlashOnSeq(flashRef, lastSeq);
    },
    { initialProps: { lastSeq: 0 } },
  );

  return {
    advanceSeq(lastSeq: number): void {
      act(() => {
        rerender({ lastSeq });
      });
    },
  };
}
