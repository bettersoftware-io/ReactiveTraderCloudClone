import { describe, expect, it } from "vitest";

import { InspectorStore } from "../InspectorStore";
import { PROTOCOL_VERSION } from "../protocol";

describe("InspectorStore dev flag", () => {
  it("defaults dev to false and a welcome without dev keeps it false", () => {
    const store = new InspectorStore();
    expect(store.getSnapshot().dev).toBe(false);

    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });
    expect(store.getSnapshot().dev).toBe(false);
  });

  it("flows welcome.dev === true into InspectorState.dev", () => {
    const store = new InspectorStore();
    store.apply({
      kind: "welcome",
      v: PROTOCOL_VERSION,
      appId: "a",
      dev: true,
    });
    expect(store.getSnapshot().dev).toBe(true);
  });
});
