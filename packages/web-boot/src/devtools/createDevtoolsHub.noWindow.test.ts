// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createDevtoolsHub } from "#/devtools/createDevtoolsHub";

// A runtime with no `window` at all, for real: the node environment, rather
// than a jsdom page with `window` stubbed away (under the vmThreads pool
// jsdom's `window` is the context's global and cannot be replaced).
describe("createDevtoolsHub without a window", () => {
  it("builds a hub where window is unavailable", () => {
    expect(typeof globalThis.window).toBe("undefined");

    const hub = createDevtoolsHub({ appId: "rtc-test", dev: false });

    expect(typeof hub.dispose).toBe("function");
  });
});
