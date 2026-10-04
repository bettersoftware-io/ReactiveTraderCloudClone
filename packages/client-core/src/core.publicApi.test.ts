import { describe, expect, it } from "vitest";

import * as core from "#/core";
import * as root from "#/index";
import * as presenters from "#/presenters/index";

/** The `@rtc/client-core/core` subpath is the RxJS core's only public
 * surface: the composition root (approach B) and, since the edge surface
 * (ADR-006 Follow-up 9), everything the presenter barrel exports too. NONE of it
 * is reachable from the root index — a root export would put it back on the
 * web clients' eager import graph, which is what `pnpm check:core-bundle` and
 * dependency-cruiser's `client-core-root-is-the-edge` forbid. The root
 * exports none of the presenter barrel's types either: a contract type comes
 * from `@rtc/core-api`, a presenter class's own type from this subpath. */
describe("@rtc/client-core/core", () => {
  it("exports the composition root", () => {
    expect(Object.keys(core)).toEqual(
      expect.arrayContaining([...COMPOSITION_ROOT]),
    );
  });

  it("is the ONLY place the composition root is exported from", () => {
    const rootKeys = new Set(Object.keys(root));

    for (const name of COMPOSITION_ROOT) {
      expect(rootKeys.has(name), `root index exports ${name}`).toBe(false);
    }
  });

  it("is the ONLY place the presenter barrel's values are exported from", () => {
    const barrel = Object.keys(presenters);
    const rootKeys = new Set(Object.keys(root));
    const leaked = barrel.filter((name) => {
      return rootKeys.has(name);
    });

    // Positive witness that the barrel still names the core's building
    // blocks — an empty barrel would make the `leaked` assertion vacuous.
    expect(barrel).toContain("RfqsPresenter");
    expect(barrel).toContain("createRfqTileMachine");
    expect(leaked).toEqual([]);
  });

  it("has a pinned runtime surface", () => {
    expect(Object.keys(core).sort()).toMatchSnapshot();
  });
});

const COMPOSITION_ROOT: readonly string[] = [
  "RXJS_CORE_BRAND",
  "createApp",
  "createMachineFactories",
  "rxjsCore",
];
