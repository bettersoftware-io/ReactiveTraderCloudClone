import { afterEach, describe, expect, it } from "vitest";

import { CHART_PALETTE_TOKENS } from "@rtc/motion-core";

import { readChartPalette } from "./readChartPalette";

// Every element is attached to the document: a disconnected element has no
// computed style (browsers and jsdom ≥ 31 return "" for every property), and
// the chart only ever reads its palette off a mounted canvas host.
afterEach(() => {
  document.body.replaceChildren();
});

describe("readChartPalette", () => {
  it("reads tokens set on the element's inline style", () => {
    const el = document.body.appendChild(document.createElement("div"));
    el.style.setProperty(CHART_PALETTE_TOKENS.up, "#0f0");
    el.style.setProperty(CHART_PALETTE_TOKENS.down, "#f00");

    const palette = readChartPalette(el);

    expect(palette.up).toBe("#0f0");
    expect(palette.down).toBe("#f00");
  });

  it("reads an unset token as an empty string", () => {
    const el = document.body.appendChild(document.createElement("div"));

    const palette = readChartPalette(el);

    expect(palette.grid).toBe("");
  });

  it("reads every declared palette key", () => {
    const el = document.body.appendChild(document.createElement("div"));

    const palette = readChartPalette(el);

    for (const key of Object.keys(CHART_PALETTE_TOKENS)) {
      expect(palette).toHaveProperty(key);
    }
  });
});
