import { describe, expect, it } from "vitest";

import * as core from "#/core";
import * as root from "#/index";

/** The `@rtc/client-core/core` subpath is the RxJS core's only public
 * surface: the composition root (approach B) and, since the edge surface
 * (ADR-006 Follow-up 9), every presenter and machine factory too. NONE of it
 * is reachable from the root index — a root export would put it back on the
 * web clients' eager import graph, which is what `pnpm check:core-bundle` and
 * dependency-cruiser's `client-core-root-is-the-edge` forbid. The root keeps
 * the presenter barrel's TYPES (`export type *`), which cost nothing at
 * runtime. */
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

  it("is the ONLY place a presenter class or a machine factory is exported from", () => {
    const internals = Object.keys(core).filter((name) => {
      return CORE_INTERNAL.test(name);
    });

    const leaked = Object.keys(root).filter((name) => {
      return CORE_INTERNAL.test(name);
    });

    // Positive witness that the pattern still names the core's building
    // blocks — an empty match would make the `leaked` assertion vacuous.
    expect(internals).toContain("RfqsPresenter");
    expect(internals).toContain("createRfqTileMachine");
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

/** A presenter class (`RfqsPresenter`) or a machine factory
 * (`createRfqTileMachine`) — the RxJS core's own building blocks. */
const CORE_INTERNAL: RegExp = /Presenter$|^create\w+Machine$/;
