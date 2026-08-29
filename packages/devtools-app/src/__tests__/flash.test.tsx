import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useFlashOnSeq } from "#/panels/flash";

let animateSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  animateSpy = vi.fn();
  Element.prototype.animate =
    animateSpy as unknown as typeof Element.prototype.animate;
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("flashes once per lastSeq advance past 0, never on unrelated re-renders", () => {
  const flashRef: RefObject<HTMLSpanElement | null> = {
    current: document.createElement("span"),
  };

  const { rerender } = renderHook(
    ({ lastSeq }: HookProps) => {
      useFlashOnSeq(flashRef, lastSeq);
    },
    { initialProps: { lastSeq: 0 } },
  );
  expect(animateSpy).not.toHaveBeenCalled();

  act(() => {
    rerender({ lastSeq: 3 });
  });
  expect(animateSpy).toHaveBeenCalledTimes(1);
  expect(animateSpy.mock.calls[0]?.[0]).toEqual([
    { opacity: 0.35 },
    { opacity: 1 },
  ]);
  expect(animateSpy.mock.calls[0]?.[1]).toEqual({
    duration: 300,
    easing: "ease-out",
  });

  // Re-render with the SAME lastSeq: proves the effect is memoized on the
  // dependency array (not refired on every render, unrelated or otherwise).
  act(() => {
    rerender({ lastSeq: 3 });
  });
  expect(animateSpy).toHaveBeenCalledTimes(1);

  act(() => {
    rerender({ lastSeq: 4 });
  });
  expect(animateSpy).toHaveBeenCalledTimes(2);
});

interface HookProps {
  lastSeq: number;
}
