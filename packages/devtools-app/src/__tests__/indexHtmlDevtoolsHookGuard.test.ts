import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

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

test("the guard's inline classic script appears before the module script", () => {
  const guardIndex = html.indexOf("<script>");
  const moduleIndex = html.indexOf('<script type="module"');

  expect(guardIndex).toBeGreaterThan(-1);
  expect(moduleIndex).toBeGreaterThan(-1);
  expect(guardIndex).toBeLessThan(moduleIndex);
});

test("importing the guard disables an installed hook", () => {
  const window: FakeHookWindow = {
    __REACT_DEVTOOLS_GLOBAL_HOOK__: { isDisabled: false },
    location: { search: "" },
  };

  runGuardScript(window);

  expect(window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.isDisabled).toBe(true);
});

test("?react-devtools keeps the hook enabled for debugging the inspector itself", () => {
  const window: FakeHookWindow = {
    __REACT_DEVTOOLS_GLOBAL_HOOK__: { isDisabled: false },
    location: { search: "?react-devtools" },
  };

  runGuardScript(window);

  expect(window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.isDisabled).toBe(false);
});

test("no hook installed is a no-op", () => {
  const window: FakeHookWindow = { location: { search: "" } };

  expect(() => {
    runGuardScript(window);
  }).not.toThrow();
});

function extractGuardScriptBody(source: string): string {
  const match = source.match(/<script>([\s\S]*?)<\/script>/);

  if (match === null) {
    throw new Error("guard <script> not found in index.html");
  }

  return match[1];
}

function runGuardScript(window: FakeHookWindow): void {
  const body = extractGuardScriptBody(html);
  const run = new Function("window", body) as (win: FakeHookWindow) => void;

  run(window);
}

interface FakeHookWindow {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: { isDisabled?: boolean };
  location: { search: string };
}
