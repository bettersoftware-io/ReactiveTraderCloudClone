import { describe, expect, it } from "vitest";

import * as clientCore from "#/index";

/** The root index's runtime surface, pinned: the EDGE the clients, bindings,
 * ui-contract and devtools import statically. A name appearing here ships in
 * every web client's eager bundle, so an addition is a decision, not a side
 * effect of a barrel. The core's own surface is pinned separately, in
 * `core.publicApi.test.ts`. Type exports are covered by the typecheck. */
describe("@rtc/client-core public runtime API", () => {
  it("has a pinned runtime surface", () => {
    expect(Object.keys(clientCore).sort()).toMatchSnapshot();
  });
});
