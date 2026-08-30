// packages/client-react-native/src/ui/rates/ticket/sheetPresentation.test.ts
import { expect, test } from "@jest/globals";

import { sheetPresentation } from "#/ui/rates/ticket/sheetPresentation";

// The reduced-motion / Freeze arm. BOTH props are asserted, not just the
// mount: `animateOnMount: false` alone still leaves the dismiss and the
// `enableDynamicSizing` height re-measure animating, and `animationConfigs`
// alone still slides the sheet up on present.
test("presents with no animation at all when shell motion is off", () => {
  expect(sheetPresentation(false)).toEqual({
    animateOnMount: false,
    animationConfigs: { duration: 0 },
  });
});

// `duration` (not `easing`, not a spring key) is load-bearing twice over: it
// makes the transition instant, and its presence is what selects gorhom's
// timing path over its default spring.
test("the instant config is a zero-duration timing config, never a spring", () => {
  const { animationConfigs } = sheetPresentation(false);

  expect(animationConfigs).toBeDefined();
  expect(Object.keys(animationConfigs ?? {})).toEqual(["duration"]);
});

// The other arm, so this is proven to BE a gate rather than a permanent
// opt-out of the sheet's motion. `undefined` leaves gorhom's own defaults
// untouched — a config here would silently restyle the present for every
// non-Freeze user.
test("keeps the sheet's own present animation when shell motion is on", () => {
  expect(sheetPresentation(true)).toEqual({
    animateOnMount: true,
    animationConfigs: undefined,
  });
});
