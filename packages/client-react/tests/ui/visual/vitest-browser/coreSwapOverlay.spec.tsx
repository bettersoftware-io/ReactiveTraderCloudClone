import { expect, test } from "vitest";
import { render } from "vitest-browser-react";

import {
  CoreSwapOverlay,
  type CoreSwapOverlayProps,
} from "#/ui/shell/core/CoreSwapOverlay";

// The core-swap overlay's stylesheet, read back from a real browser. jsdom
// applies no CSS, and the pixel tier captures one still frame, so nothing
// else can see these rules:
//
// - the cover is fully opaque from `loading` on BY RULE (`transition-property:
//   none` outside `covering`), because the app tree is unmounted behind it
//   and a fade that started late would still be running;
// - the two fades take their durations from the custom properties the
//   component writes. A renamed variable makes `transition` invalid at
//   computed-value time: a silent jump cut while the host still waits;
// - both fades ease out (the fade-out is removed on the host's clock, so it
//   must do most of its work early).
//
// Twin of client-solid's spec of the same name.

test("covering: the fade-in is an opacity transition of the swap's enterMs", async () => {
  const style = await renderedStyle("covering");

  expect(style.transitionProperty).toBe("opacity");
  expect(style.transitionDuration).toBe("0.16s");
  expect(style.transitionTimingFunction).toBe("ease-out");
});

test.each(["loading", "handover"] as const)(
  "%s: no transition is left, and the cover is fully opaque",
  async (phase) => {
    const style = await renderedStyle(phase);

    expect(style.transitionProperty).toBe("none");
    expect(style.opacity).toBe("1");
  },
);

test("revealing: the fade-out is an opacity transition of the swap's exitMs, easing out", async () => {
  const style = await renderedStyle("revealing");

  expect(style.transitionProperty).toBe("opacity");
  expect(style.transitionDuration).toBe("0.2s");
  expect(style.transitionTimingFunction).toBe("ease-out");
});

/** Mounts the overlay in `phase` with real fade durations and returns the
 * cover's computed style. */
async function renderedStyle(
  phase: NonNullable<CoreSwapOverlayProps["swap"]>["phase"],
): Promise<CSSStyleDeclaration> {
  const screen = await render(
    <CoreSwapOverlay
      swap={{
        from: { impl: "rxjs", label: "RxJS", description: "" },
        to: { impl: "effect", label: "Effect-TS", description: "" },
        phase,
      }}
      fade={FADE}
    />,
  );

  return getComputedStyle(screen.getByTestId("core-swap-overlay").element());
}

const FADE = { enterMs: 160, exitMs: 200 };
