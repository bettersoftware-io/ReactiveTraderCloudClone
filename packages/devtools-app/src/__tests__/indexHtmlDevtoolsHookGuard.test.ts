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
  const guardIndex = html.indexOf(findGuardScript(html));
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
  const guard = findGuardScript(source);

  return guard.slice(SCRIPT_OPEN.length, guard.length - SCRIPT_CLOSE.length);
}

/** The guard is identified by what it does (it names the hook), never by
 * position — a second bare inline script above it must not be mistaken for it. */
function findGuardScript(source: string): string {
  const guard = collectInlineScriptBlocks(source).find((block) => {
    return block.includes("__REACT_DEVTOOLS_GLOBAL_HOOK__");
  });

  if (guard === undefined) {
    throw new Error("guard <script> not found in index.html");
  }

  return guard;
}

// Index scanning rather than a `/<script>…<\/script>/` regex: CodeQL flags any
// tag-matching regex as js/bad-tag-filter (bypassable as an HTML *sanitizer* —
// a role this test-only extractor of our own committed index.html never plays,
// but scanning literals is just as clear and keeps the alert unrepresentable).
function collectInlineScriptBlocks(source: string): string[] {
  const blocks: string[] = [];
  let from = 0;

  for (;;) {
    const open = source.indexOf(SCRIPT_OPEN, from);

    if (open === -1) {
      break;
    }

    const close = source.indexOf(SCRIPT_CLOSE, open);

    if (close === -1) {
      break;
    }

    const end = close + SCRIPT_CLOSE.length;
    blocks.push(source.slice(open, end));
    from = end;
  }

  return blocks;
}

const SCRIPT_OPEN = "<script>";
const SCRIPT_CLOSE = "</script>";

function runGuardScript(window: FakeHookWindow): void {
  const body = extractGuardScriptBody(html);
  const run = new Function("window", body) as (win: FakeHookWindow) => void;

  run(window);
}

interface FakeHookWindow {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: { isDisabled?: boolean };
  location: { search: string };
}
