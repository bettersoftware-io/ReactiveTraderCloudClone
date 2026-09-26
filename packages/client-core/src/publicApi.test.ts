import { describe, expect, it } from "vitest";

import * as clientCore from "#/index";

/** The move to @rtc/core-logic must not change what @rtc/client-core
 * exports at runtime: the clients, bindings, ui-contract and devtools all
 * import these names from it. Type exports are covered by their typecheck. */
describe("@rtc/client-core public runtime API", () => {
  it("is unchanged by the core-logic extraction", () => {
    expect(Object.keys(clientCore).sort()).toMatchSnapshot();
  });
});
