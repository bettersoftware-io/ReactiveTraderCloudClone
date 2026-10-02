import { expect, test } from "vitest";

import { withAlpha } from "#/ui/theme/withAlpha";

// Each pair is a suffix a call site used to append by hand, and the design
// percentage it stood for. The helper must reproduce the byte exactly: these
// colours are inside committed goldens.
test.each([
  [0.07, "12"],
  [0.12, "1F"],
  [0.45, "73"],
  [0.55, "8C"],
  [0, "00"],
])("a six-digit hex at %s gets the alpha byte %s", (alpha, byte) => {
  expect(withAlpha("#3b82f6", alpha)).toBe(`#3b82f6${byte}`);
});

test("a three-digit hex is expanded before the alpha byte is added", () => {
  expect(withAlpha("#0af", 0.12)).toBe("#00aaff1F");
});

test("an rgb() colour comes back as rgba(), which a hex suffix would have broken", () => {
  expect(withAlpha("rgb(0, 224, 255)", 0.12)).toBe("rgba(0,224,255,0.12)");
});

test("a colour that already has alpha has it multiplied, not replaced", () => {
  expect(withAlpha("rgba(0,224,255,0.5)", 0.12)).toBe("rgba(0,224,255,0.06)");
  expect(withAlpha("#00e0ff80", 0.5)).toBe("#00e0ff40");
});

test("alpha is clamped to 0–1", () => {
  expect(withAlpha("#3b82f6", 2)).toBe("#3b82f6FF");
  expect(withAlpha("#3b82f6", -1)).toBe("#3b82f600");
});

test("an unsupported colour throws instead of painting nothing", () => {
  expect(() => {
    return withAlpha("cyan", 0.12);
  }).toThrow('withAlpha: unsupported colour "cyan"');
});
