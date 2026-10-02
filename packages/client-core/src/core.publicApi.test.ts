import { describe, expect, it } from "vitest";

import * as core from "#/core";
import * as root from "#/index";

/** The `@rtc/client-core/core` subpath is the RxJS composition root's only
 * public surface (approach B): everything that constructs an app lives here,
 * and NONE of it is reachable from the root index — a root export would put
 * the composition root back on the web clients' eager import graph, which is
 * exactly what `pnpm check:core-bundle` forbids. */
describe("@rtc/client-core/core", () => {
  it("exports the composition root and nothing else", () => {
    expect(Object.keys(core).sort()).toEqual([
      "RXJS_CORE_BRAND",
      "createApp",
      "createMachineFactories",
      "rxjsCore",
    ]);
  });

  it("is the ONLY place the composition root is exported from", () => {
    const rootKeys = new Set(Object.keys(root));

    for (const name of Object.keys(core)) {
      expect(rootKeys.has(name), `root index exports ${name}`).toBe(false);
    }
  });
});
