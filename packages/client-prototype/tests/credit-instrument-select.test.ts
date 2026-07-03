import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

describe("InstrumentSelect.module.css", () => {
  test("the dropdown label has no open-state border override (PROTO's border is the fixed 1px solid var(--border) at every state)", () => {
    const cssPath = path.resolve(
      __dirname,
      "../src/credit/NewRfq/InstrumentSelect.module.css",
    );
    const css = readFileSync(cssPath, "utf-8");

    expect(css).not.toContain('[data-open="true"]');
  });
});
