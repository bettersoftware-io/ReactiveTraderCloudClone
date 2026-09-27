import { describe, expect, it } from "vitest";

import { dropArgSeparator } from "./forwardedArgs";

describe("dropArgSeparator", () => {
  it("drops the separator pnpm forwards, keeping the filter after it", () => {
    expect(
      dropArgSeparator(["test", "--config", "x.ts", "--", "layout"]),
    ).toEqual(["test", "--config", "x.ts", "layout"]);
  });

  it("leaves arguments without a separator untouched", () => {
    expect(dropArgSeparator(["test", "--config", "x.ts"])).toEqual([
      "test",
      "--config",
      "x.ts",
    ]);
  });

  it("drops only the first separator", () => {
    expect(dropArgSeparator(["test", "--", "a", "--", "b"])).toEqual([
      "test",
      "a",
      "--",
      "b",
    ]);
  });
});
