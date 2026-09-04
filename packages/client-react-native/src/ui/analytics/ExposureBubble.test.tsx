import { expect, test } from "@jest/globals";
import type { SkFont } from "@shopify/react-native-skia";

import type { BubbleDrawEntry } from "#/ui/analytics/bubbleDrawModel";
import { ExposureBubble } from "#/ui/analytics/ExposureBubble";
import { exposureBubblePage } from "#tests/pages/ExposureBubblePage";

const page = exposureBubblePage();

const ENTRY: BubbleDrawEntry = {
  currency: "EUR",
  x: 60,
  y: 60,
  radius: 60,
  sign: "pos",
  currencyFontSize: 15,
  currencyBaseline: -1,
  amount: "+100.0M",
  amountBaseline: 10,
};

const FONT = {
  getTextWidth: () => {
    return 24;
  },
} as unknown as SkFont;

/**
 * A bubble is pure Skia, so no part of it carries a `testID` to query. What a
 * test CAN see is the shape of the drawn tree: the jest mock renders each Skia
 * primitive as a host element named after it, so counting those is a real
 * assertion about which layers were drawn. The geometry those layers use is
 * `buildBubbleDrawModel`'s and is asserted there.
 */
test("stacks a fill and a ring under both labels — and NO glow", async () => {
  await page.mount(bubble({ currencyFont: FONT, amountFont: FONT }));

  // T37: the MOBILE design is TWO layers, an 11% fill and a full-opacity
  // hairline ring (dc.html:194). The third circle and the radial gradient
  // asserted here previously came from the v2 WEB prototype's stylesheet,
  // which this component had been ported from by mistake. The explicit zero
  // is the point of the test — a glow creeping back is the regression.
  expect(page.countHosts("SkiaCircle")).toBe(2);
  expect(page.countHosts("SkiaRadialGradient")).toBe(0);
  expect(page.countHosts("SkiaText")).toBe(2);
});

// `useFont` resolves asynchronously and yields null first. The disc must still
// draw through that window — a bubble that threw while its font loaded would
// take the whole Analytics screen down on a cold start.
test("draws the disc but no text while the typefaces are still loading", async () => {
  await page.mount(bubble({ currencyFont: null, amountFont: null }));

  expect(page.countHosts("SkiaCircle")).toBe(2);
  expect(page.countHosts("SkiaText")).toBe(0);
});

// A bubble too small for a second line carries `amount: null`. The amount font
// is loaded regardless, so the null is what has to suppress the label.
test("omits the amount label when the bubble is too small for one", async () => {
  await page.mount(
    bubble({ currencyFont: FONT, amountFont: FONT, amount: null }),
  );

  expect(page.countHosts("SkiaText")).toBe(1);
});

// With motion off the bubble must draw at its RESTING geometry immediately —
// not a mid-tween frame, and not a collapsed dot waiting on a tween that never
// runs.
test("draws at rest immediately when motion is disabled", async () => {
  await page.mount(
    bubble({ currencyFont: FONT, amountFont: FONT, motionEnabled: false }),
  );

  expect(page.countHosts("SkiaCircle")).toBe(2);
});

interface BubbleOverrides {
  currencyFont: SkFont | null;
  amountFont: SkFont | null;
  amount?: string | null;
  motionEnabled?: boolean;
}

function bubble(overrides: BubbleOverrides): React.JSX.Element {
  return (
    <ExposureBubble
      entry={
        overrides.amount === undefined
          ? ENTRY
          : { ...ENTRY, amount: overrides.amount }
      }
      color="#22c55e"
      amountColor="#94a3b8"
      currencyFont={overrides.currencyFont}
      amountFont={overrides.amountFont}
      motionEnabled={overrides.motionEnabled ?? true}
    />
  );
}
