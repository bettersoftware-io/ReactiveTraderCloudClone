import { describe, expect, it } from "vitest";

import { NATIVE_PRESENTER_MANIFEST } from "#/app/devtools/presenterManifest";

describe("NATIVE_PRESENTER_MANIFEST", () => {
  it("never observes jarvisOwnKey: an instrumented intent logs its arguments, and save's is the raw key", () => {
    expect(NATIVE_PRESENTER_MANIFEST).not.toHaveProperty("jarvisOwnKey");
  });
});
