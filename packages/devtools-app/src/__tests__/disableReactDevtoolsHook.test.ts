import { beforeEach, expect, test, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  delete (window as HookWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  window.history.replaceState(null, "", "/devtools/");
});

test("importing the module disables an installed hook", async () => {
  (window as HookWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__ = { isDisabled: false };
  await import("#/disableReactDevtoolsHook");
  expect(
    (window as HookWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__?.isDisabled,
  ).toBe(true);
});

test("?react-devtools keeps the hook enabled for debugging the inspector itself", async () => {
  window.history.replaceState(null, "", "/devtools/?react-devtools");
  (window as HookWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__ = { isDisabled: false };
  await import("#/disableReactDevtoolsHook");
  expect(
    (window as HookWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__?.isDisabled,
  ).toBe(false);
});

test("no hook installed is a no-op", async () => {
  await expect(import("#/disableReactDevtoolsHook")).resolves.toBeDefined();
});

interface HookWindow {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: { isDisabled?: boolean };
}
