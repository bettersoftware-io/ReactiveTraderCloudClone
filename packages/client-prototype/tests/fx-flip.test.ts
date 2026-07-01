import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useFlip } from "#/motion/useFlip";

afterEach(cleanup);

describe("useFlip", () => {
  test("re-measures across a key change without throwing and skips animate when reduce is set", () => {
    const container = document.createElement("div");
    const nodeA = document.createElement("div");
    nodeA.setAttribute("data-flip-key", "a");
    const nodeB = document.createElement("div");
    nodeB.setAttribute("data-flip-key", "b");
    container.append(nodeA, nodeB);
    document.body.append(container);

    // jsdom doesn't implement Element.animate at all — stub it so
    // vi.spyOn has a real method to wrap (the hook's try/catch around
    // node.animate(...) means it works fine either way).
    if (typeof Element.prototype.animate !== "function") {
      Element.prototype.animate = stubAnimate;
    }

    const animateSpy = vi.spyOn(Element.prototype, "animate");
    const rootRef = { current: container };

    const { rerender } = renderHook(
      (props: HarnessProps) => {
        useFlip(rootRef, props.filterKey, { reduce: true });
      },
      { initialProps: { filterKey: "All" } },
    );

    expect(() => {
      act(() => {
        rerender({ filterKey: "EUR" });
      });
    }).not.toThrow();

    // jsdom rects are always 0,0, so dx/dy would already be 0 regardless —
    // this pins down that the reduce:true path never even attempts a glide.
    expect(animateSpy).not.toHaveBeenCalled();

    container.remove();
  });
});

interface HarnessProps {
  filterKey: string;
}

function stubAnimate(): Animation {
  return {} as unknown as Animation;
}
