import { describe, expect, it } from "vitest";

import * as rxjsCorePackage from "#/index";

/** The whole RxJS core's runtime surface: the composition root and, for
 * tests and harnesses that construct one directly, every presenter class and
 * machine factory. An addition here is a decision, not a side effect. */
describe("@rtc/client-core-rxjs public runtime API", () => {
  it("has a pinned runtime surface", () => {
    expect(Object.keys(rxjsCorePackage).sort()).toMatchSnapshot();
  });

  it("exports the composition root", () => {
    expect(Object.keys(rxjsCorePackage)).toEqual(
      expect.arrayContaining([
        "RXJS_CORE_BRAND",
        "createApp",
        "createMachineFactories",
        "rxjsCore",
      ]),
    );
  });

  it("carries the brand the bundle gate looks for", () => {
    expect(rxjsCorePackage.RXJS_CORE_BRAND).toBe("@rtc/client-core-rxjs:brand");
  });
});
