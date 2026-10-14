import { describe, expect, it } from "vitest";

import { offersRegistration } from "#/buildBrowserPorts";

import { createWebBootEnv } from "./createPortsOptions";

describe("offersRegistration", () => {
  it("is false with no server URL", () => {
    expect(offersRegistration(createWebBootEnv({}))).toBe(false);
  });

  it("is false for an empty server URL, which the dev:*:sim scripts set", () => {
    expect(offersRegistration(createWebBootEnv({ serverUrl: "" }))).toBe(false);
  });

  it("is true with a server URL", () => {
    expect(offersRegistration(createWebBootEnv({ serverUrl: "ws://x" }))).toBe(
      true,
    );
  });
});
