import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, expect, test, vi } from "vitest";

import { disableReactDevtoolsHook } from "#/disableReactDevtoolsHook";

afterEach(() => {
  delete (window as HookWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  window.history.replaceState({}, "", "/");
  vi.resetModules();
});

test("the guard module loads before the app module, and neither is inline", () => {
  const guardIndex = html.indexOf(
    '<script type="module" src="/src/disableReactDevtoolsHook.ts">',
  );
  const appIndex = html.indexOf('<script type="module" src="/src/main.tsx">');

  expect(guardIndex).toBeGreaterThan(-1);
  expect(appIndex).toBeGreaterThan(-1);
  expect(guardIndex).toBeLessThan(appIndex);
  // The deployed Content-Security-Policy is `script-src 'self'`.
  expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/);
});

test("disables an installed hook", () => {
  const hook = { isDisabled: false };

  disableReactDevtoolsHook(hook, false);

  expect(hook.isDisabled).toBe(true);
});

test("?react-devtools keeps the hook enabled for debugging the inspector itself", () => {
  const hook = { isDisabled: false };

  disableReactDevtoolsHook(hook, true);

  expect(hook.isDisabled).toBe(false);
});

test("no hook installed is a no-op", () => {
  expect(() => {
    disableReactDevtoolsHook(undefined, false);
  }).not.toThrow();
});

test("importing the module disables the page's hook", async () => {
  const window_ = window as HookWindow;
  window_.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { isDisabled: false };

  await import("#/disableReactDevtoolsHook");

  expect(window_.__REACT_DEVTOOLS_GLOBAL_HOOK__.isDisabled).toBe(true);
});

test("importing the module with ?react-devtools in the URL leaves the hook enabled", async () => {
  const window_ = window as HookWindow;
  window_.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { isDisabled: false };
  window.history.replaceState({}, "", "/?react-devtools");

  await import("#/disableReactDevtoolsHook");

  expect(window_.__REACT_DEVTOOLS_GLOBAL_HOOK__.isDisabled).toBe(false);
});

// `join(dirname(fileURLToPath(import.meta.url)), ...)` rather than the more
// obvious `new URL("../../index.html", import.meta.url)`: Vite statically
// recognises that two-argument `new URL(literal, import.meta.url)` shape and
// rewrites it into a dev-server asset URL (`http://localhost:.../index.html`)
// instead of leaving it as a runtime file path, which breaks `fileURLToPath`
// under Vitest's jsdom environment (`ERR_INVALID_URL_SCHEME`). This form
// still resolves relative to the test file, just outside that pattern.
const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../index.html"),
  "utf8",
);

interface HookWindow {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: { isDisabled?: boolean };
}
