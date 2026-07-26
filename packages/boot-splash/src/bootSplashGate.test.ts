import { afterEach, describe, expect, it, vi } from "vitest";

import { shouldPlayBootSplash } from "./bootSplashGate";

afterEach(() => {
  // Unstub FIRST: the no-window test replaces `window`, and the resets below
  // reach through it (window.history / navigator).
  vi.unstubAllGlobals();
  setSearch("");
  setWebdriver(false);
});

describe("shouldPlayBootSplash", () => {
  it("plays the splash on a plain (non-automated) load", () => {
    setSearch("");
    expect(shouldPlayBootSplash()).toBe(true);
  });

  it("suppresses the splash when ?nosplash is present", () => {
    setSearch("?nosplash");
    expect(shouldPlayBootSplash()).toBe(false);
  });

  it("suppresses the splash when nosplash sits alongside other params", () => {
    setSearch("?foo=1&nosplash");
    expect(shouldPlayBootSplash()).toBe(false);
  });

  it("suppresses the splash under browser automation regardless of the URL", () => {
    setSearch("");
    setWebdriver(true);
    expect(shouldPlayBootSplash()).toBe(false);
  });

  it("?splash forces the splash ON even under webdriver automation", () => {
    setWebdriver(true);
    setSearch("?splash");
    expect(shouldPlayBootSplash()).toBe(true);
  });

  it("?splash forces the splash ON even alongside ?nosplash", () => {
    setWebdriver(true);
    setSearch("?splash&nosplash");
    expect(shouldPlayBootSplash()).toBe(true);
  });

  it("does not play without a window — the gate reads location, so it must not throw on the server", () => {
    // @rtc/boot-splash is a DOM-touching leaf; this guard is the one thing
    // standing between a server render and a ReferenceError.
    vi.stubGlobal("window", undefined);
    expect(shouldPlayBootSplash()).toBe(false);
  });
});

/** Drive window.location.search via the History API (jsdom-supported). */
function setSearch(search: string): void {
  window.history.replaceState({}, "", `/${search}`);
}

/** Override navigator.webdriver (read-only by default) for one test. */
function setWebdriver(value: boolean): void {
  Object.defineProperty(navigator, "webdriver", {
    configurable: true,
    value,
  });
}
