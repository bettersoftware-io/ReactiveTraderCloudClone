import { describe, expect, it } from "vitest";

import * as clientCore from "#/index";

/** The root index's runtime surface, pinned: the adapters, port factories
 * and stores a client imports statically. A name appearing here ships in
 * every web client's eager bundle, so an addition is a decision, not a side
 * effect of a barrel. Each core's own surface is pinned in its own package
 * (`packages/client-core-rxjs/src/publicApi.test.ts`). Type exports are
 * covered by the typecheck. */
describe("@rtc/client-adapters public runtime API", () => {
  it("has a pinned runtime surface", () => {
    expect(Object.keys(clientCore).sort()).toMatchSnapshot();
  });
});
