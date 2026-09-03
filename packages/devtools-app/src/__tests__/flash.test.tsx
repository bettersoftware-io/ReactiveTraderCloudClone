import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { flashHookPage } from "#tests/pages/FlashHookPage";

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
  const flash = flashHookPage();

  expect(animateSpy).not.toHaveBeenCalled();

  flash.advanceSeq(3);
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
  flash.advanceSeq(3);
  expect(animateSpy).toHaveBeenCalledTimes(1);

  flash.advanceSeq(4);
  expect(animateSpy).toHaveBeenCalledTimes(2);
});
