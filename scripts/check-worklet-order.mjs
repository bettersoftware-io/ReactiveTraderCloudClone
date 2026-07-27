#!/usr/bin/env node
/**
 * Reports worklet -> worklet forward references: a function carrying the
 * `"worklet"` directive that calls another worklet declared LATER in the same
 * file.
 *
 * WHY THIS EXISTS. The worklets Babel transform rewrites `function foo()` into
 * a non-hoisted binding and captures each worklet's closure by value at module
 * evaluation. A worklet defined earlier therefore captures a later sibling
 * before it is initialised, and gets `undefined` on the UI thread — no throw at
 * definition, no warning, just a scene that silently draws nothing. Imported
 * worklets are live module bindings evaluated first, so they are immune.
 *
 * Proven on device: moving one helper above its caller flipped it from
 * `undefined` to `function` while its still-below sibling did not move. See
 * `docs/research/2026-07-27-rn-boot-scenes-blank-on-device.md`.
 *
 * NOT YET A CI GATE, deliberately. It reproduces the observed 5-broken /
 * 3-clean split across the boot scenes exactly, but fixing every reference it
 * reports did NOT make the one scene tried render — so it is necessary and not
 * sufficient, and gating on it would imply a guarantee it cannot make. Promote
 * it once the remaining cause is understood.
 *
 * KNOWN BLIND SPOTS (widen before trusting a clean report):
 *   - only `function` declarations; arrow-function consts are invisible
 *   - only direct `name(` calls; functions passed as values are missed
 *   - no cross-file resolution (imports are assumed safe, which is correct)
 *
 * Usage: node scripts/check-worklet-order.mjs [glob-root]
 */
import { globSync, readFileSync } from "node:fs";

const root = process.argv[2] ?? "packages/client-react-native/src";
const files = globSync(`${root}/**/*.{ts,tsx}`).filter((f) => {
  return !f.includes(".test.");
});

let total = 0;

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  const declaredAt = new Map();
  const isWorklet = new Map();

  lines.forEach((line, index) => {
    const match = /^function ([A-Za-z_][A-Za-z0-9_]*)\(/.exec(line);

    if (match === null) {
      return;
    }

    // Signatures span multiple lines; walk to the line that opens the body.
    let cursor = index;

    while (cursor < lines.length && !lines[cursor].trimEnd().endsWith("{")) {
      cursor += 1;
    }

    declaredAt.set(match[1], index);
    isWorklet.set(match[1], (lines[cursor + 1] ?? "").trim() === '"worklet";');
  });

  const ordered = [...declaredAt.entries()].sort((a, b) => {
    return a[1] - b[1];
  });

  ordered.forEach(([name, start], position) => {
    if (isWorklet.get(name) !== true) {
      return;
    }

    const end =
      position + 1 < ordered.length ? ordered[position + 1][1] : lines.length;
    const body = lines.slice(start, end).join("\n");

    // Deduplicated: one report per (caller, callee) pair, however many times
    // the call appears in the body.
    const reported = new Set();

    for (const [, callee] of body.matchAll(
      /(?<![.\w])([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    )) {
      if (
        callee !== name &&
        !reported.has(callee) &&
        isWorklet.get(callee) === true &&
        declaredAt.get(callee) > start
      ) {
        reported.add(callee);
        console.log(
          `${file}:${start + 1}  ${name} -> ${callee} (declared at line ${declaredAt.get(callee) + 1})`,
        );
        total += 1;
      }
    }
  });
}

console.log(
  total === 0
    ? "check-worklet-order: no worklet-to-worklet forward references"
    : `check-worklet-order: ${total} forward reference(s) — each resolves to undefined on the UI thread`,
);
