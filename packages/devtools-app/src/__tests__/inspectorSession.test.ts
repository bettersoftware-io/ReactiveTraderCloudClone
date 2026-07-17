import { expect, test } from "vitest";

import { createInspectorSession } from "#/inspectorSession";

test("exposes a store and a no-throw invokeIntent in the BroadcastChannel-less fallback", () => {
  const session = createInspectorSession();

  expect(session.store).toBeDefined();
  expect(typeof session.invokeIntent).toBe("function");
  expect(() => {
    session.invokeIntent("m1", "submit", []);
  }).not.toThrow();

  session.dispose();
});
