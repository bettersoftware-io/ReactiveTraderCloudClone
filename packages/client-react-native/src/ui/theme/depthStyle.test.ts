import { expect, test } from "vitest";

import { depthStyle } from "#/ui/theme/depthStyle";
import type { DepthTokens } from "#/ui/theme/tokens";

const FLAT: DepthTokens = {
  level: 0,
  shadowColor: "#000000",
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffsetY: 0,
  elevation: 0,
  topHighlight: null,
  tileGradient: null,
  headGradient: null,
  glow: null,
};

const PHYSICAL: DepthTokens = {
  level: 2,
  shadowColor: "#000000",
  shadowOpacity: 0.62,
  shadowRadius: 12,
  shadowOffsetY: 8,
  elevation: 10,
  topHighlight: "rgba(255,255,255,0.07)",
  tileGradient: ["rgba(18,52,68,0.95)", "rgba(10,30,43,0.88)"],
  headGradient: null,
  glow: "rgba(0,224,255,0.32)",
};

test("flat depth yields no shadow props", () => {
  expect(depthStyle(FLAT)).toEqual({});
});

test("physical depth expands to RN shadow + elevation props", () => {
  expect(depthStyle(PHYSICAL)).toEqual({
    shadowColor: "#000000",
    shadowOpacity: 0.62,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  });
});
