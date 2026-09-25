import { describe, expect, it } from "vitest";

import * as coreLogic from "#/index";

/** Every core — and, through client-core's re-export, every client, binding
 * and fixture — reads these names from here, so a name that silently stops
 * being exported is a break this pin reports by name. */
describe("@rtc/core-logic public runtime API", () => {
  it("exports exactly the pinned names", () => {
    expect(Object.keys(coreLogic).sort()).toMatchSnapshot();
  });
});
