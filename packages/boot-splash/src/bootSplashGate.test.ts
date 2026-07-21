import { afterEach, describe, expect, it } from "vitest";

import { shouldPlayBootSplash } from "./bootSplashGate";

afterEach(() => {
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
