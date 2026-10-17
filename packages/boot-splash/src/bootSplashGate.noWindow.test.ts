// @vitest-environment node

import { describe, expect, it } from "vitest";

import { shouldPlayBootSplash } from "./bootSplashGate";

// A server render, for real: the node environment has no `window`, rather
// than a jsdom page with `window` stubbed away (under the vmThreads pool
// jsdom's `window` is the context's global and cannot be replaced).
describe("shouldPlayBootSplash without a window", () => {
  it("does not play without a window — the gate reads location, so it must not throw on the server", () => {
    // @rtc/boot-splash is a DOM-touching leaf; this guard is the one thing
    // standing between a server render and a ReferenceError.
    expect(typeof globalThis.window).toBe("undefined");
    expect(shouldPlayBootSplash()).toBe(false);
  });
});
