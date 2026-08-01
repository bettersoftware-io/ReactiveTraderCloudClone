#!/usr/bin/env node
/**
 * Reports every way a Reanimated worklet can reach something that is
 * `undefined` — or not a worklet at all — on the UI thread.
 *
 * WHY THIS EXISTS. A worklet's closure is captured BY VALUE at module
 * evaluation, and the Worklets Babel plugin rewrites `function foo()` into a
 * non-hoisted binding. So a worklet that references a module-level binding
 * declared LATER in the same file captures `undefined` — no throw at
 * definition, no warning, just a scene that silently draws nothing. Separately,
 * a function reached from inside a worklet that does not itself carry
 * `"worklet"` throws `[Worklets] Tried to synchronously call a Remote
 * Function`. jest is structurally blind to BOTH classes: `babel.config.js`
 * disables the worklet plugins under `api.env("test")` and `jest.setup.ts`
 * mocks `react-native-reanimated` wholesale, so no worklet is ever transformed
 * or run. 295 green RN tests coexisted with five dead boot scenes.
 *
 * THE THREE CLASSES IT CATCHES, each proven on device (iPhone 17 / iOS 26.5)
 * during the 2026-07-31 fix:
 *
 *   1. late function  — a worklet calls a worklet declared later in the file.
 *                       (`LayersScene.drawPanels` -> 6 helpers below it)
 *   2. late const     — a worklet reads a module-level `const` declared later.
 *                       (`LayersScene.drawGhostFrame` -> `CORNER_UVS`) This is
 *                       the one that kept `layers` blank after every function
 *                       had been reordered, and the reason a function-only
 *                       detector could never be sufficient.
 *   3. no directive   — a worklet calls a function, local or imported, that is
 *                       missing `"worklet"`. (`TopoScene` -> `topoHeightAt`)
 *
 * Ordering is checked WITHIN a file only; imported bindings are live module
 * bindings evaluated first and so are immune to classes 1 and 2. Class 3 does
 * resolve across files, because that is where it actually bites.
 *
 * Usage: node scripts/check-worklet-order.mjs [glob-root ...]
 * Exit code 1 on any finding — this IS a gate.
 */
import { globSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Both trees that contain worklets. `motion-core` is included because it is
 * where `ringDashOffset` shipped unmarked (#340) — the lock ring redboxed on
 * every real device while jest stayed green — so scanning only the RN package
 * would leave a known-live blind spot. */
const DEFAULT_ROOTS = [
  "packages/client-react-native/src",
  "packages/motion-core/src",
];
const ROOTS = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_ROOTS;
/** `#/` subpath alias -> the RN package's `src` (see `project_hash_alias_imports`). */
const ALIAS_PREFIX = "#/";
const ALIAS_TARGET = "packages/client-react-native/src";

/** Globals and host objects a worklet may legitimately reach. */
const AMBIENT = new Set([
  "Math",
  "Object",
  "Number",
  "String",
  "Array",
  "JSON",
  "Boolean",
  "Date",
  "isNaN",
  "parseFloat",
  "parseInt",
  "Infinity",
  "NaN",
  "undefined",
  "console",
  "Set",
  "Map",
  "Symbol",
  "Error",
  "RegExp",
  "global",
  "globalThis",
  "if",
  "for",
  "while",
  "switch",
  "return",
  "typeof",
  "new",
  "function",
  "const",
  "let",
  "var",
  "else",
  "do",
  "catch",
  "try",
  "throw",
  "case",
]);

/** Blank comment bodies, preserving line count and column offsets, so a name
 * mentioned in a JSDoc block is never mistaken for a reference. Getting this
 * wrong produced three phantom findings in `coreGeometry.ts` and silently
 * mis-attributed a real one in `topoGeometry.ts`. */
function stripComments(source) {
  let out = "";
  let mode = "code";

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (mode === "code") {
      if (ch === "/" && next === "*") {
        mode = "block";
        out += "  ";
        i++;
        continue;
      }
      if (ch === "/" && next === "/") {
        mode = "line";
        out += "  ";
        i++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        mode = ch;
        out += ch;
        continue;
      }
      out += ch;
      continue;
    }
    if (mode === "block") {
      if (ch === "*" && next === "/") {
        mode = "code";
        out += "  ";
        i++;
        continue;
      }
      out += ch === "\n" ? "\n" : " ";
      continue;
    }
    if (mode === "line") {
      if (ch === "\n") {
        mode = "code";
        out += "\n";
        continue;
      }
      out += " ";
      continue;
    }
    if (ch === "\\") {
      out += "  ";
      i++;
      continue;
    }
    if (ch === mode) {
      mode = "code";
    }
    out += ch;
  }
  return out;
}

/** Matches `export function`, `export default function` and bare `function`.
 * The `export` arm is load-bearing: an earlier version anchored on `^function`
 * and so never registered an exported worklet as a caller at all, which is
 * exactly how `boot3dCamera.ts`'s `gyroYawPitch -> clampUnit` went unreported
 * while `hologram` was declared "fixed but still blank". */
const FN =
  /^(?:export\s+)?(?:default\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*[(<]/;
const BINDING =
  /^(?:export\s+)?(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[=:]/;
/** Matched against the WHOLE source, not line by line: named imports here are
 * overwhelmingly multi-line, and a line-anchored version silently saw none of
 * them — which left the cross-file missing-directive check dead. */
const IMPORT_ALL = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

function parseFile(file) {
  const source = stripComments(readFileSync(file, "utf8"));
  const lines = source.split("\n");
  const decls = new Map(); // name -> { line, kind, isWorklet, end }
  const imports = new Map(); // local name -> module specifier

  for (const imp of source.matchAll(IMPORT_ALL)) {
    if (imp[1] !== undefined) {
      continue; // `import type { … }` is erased
    }
    for (const raw of imp[2].split(",")) {
      const trimmed = raw.trim();
      // Per-specifier `type` marker, e.g. `{ type TopoPeak, topoHeightAt }`.
      if (trimmed === "" || /^type\s/.test(trimmed)) {
        continue;
      }
      const name = trimmed
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) {
        imports.set(name, imp[3]);
      }
    }
  }

  lines.forEach((line, index) => {
    const fn = FN.exec(line);
    if (fn !== null) {
      let cursor = index;
      while (cursor < lines.length && !lines[cursor].trimEnd().endsWith("{")) {
        cursor++;
      }
      let end = index;
      while (end < lines.length && lines[end] !== "}") {
        end++;
      }
      decls.set(fn[1], {
        line: index,
        kind: "fn",
        isWorklet: (lines[cursor + 1] ?? "").trim() === '"worklet";',
        end,
      });
      return;
    }

    const bind = BINDING.exec(line);
    if (bind !== null && !decls.has(bind[1])) {
      decls.set(bind[1], {
        line: index,
        kind: "const",
        isWorklet: false,
        end: index,
      });
    }
  });

  return { lines, decls, imports };
}

const files = ROOTS.flatMap((root) => {
  return globSync(`${root}/**/*.{ts,tsx}`);
}).filter((f) => !f.includes(".test."));
const parsed = new Map(files.map((f) => [resolve(f), parseFile(f)]));

/** Resolve an import specifier to a parsed file, if it is inside the tree. */
function resolveModule(fromFile, spec) {
  let base;
  if (spec.startsWith(ALIAS_PREFIX)) {
    base = join(ALIAS_TARGET, spec.slice(ALIAS_PREFIX.length));
  } else if (spec.startsWith(".")) {
    base = join(dirname(fromFile), spec);
  } else {
    return undefined;
  }

  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const cand = resolve(base + ext);
    if (parsed.has(cand)) {
      return parsed.get(cand);
    }
  }
  return undefined;
}

let total = 0;

for (const file of files) {
  const abs = resolve(file);
  const { lines, decls, imports } = parsed.get(abs);

  for (const [name, decl] of decls) {
    if (decl.kind !== "fn" || !decl.isWorklet) {
      continue;
    }

    const body = lines.slice(decl.line, decl.end + 1).join("\n");
    // Names bound INSIDE the body shadow module scope — never a capture.
    const locals = new Set();
    for (const [, l] of body.matchAll(
      /(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    )) {
      locals.add(l);
    }
    for (const [, l] of body.matchAll(
      /(?:\(|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s*[:,)]/g,
    )) {
      locals.add(l);
    }

    const seen = new Set();
    const report = (msg) => {
      console.log(msg);
      total += 1;
    };

    // Classes 1 + 2: any module-level binding declared later in this file.
    for (const [, ref] of body.matchAll(
      /(?<![.\w])([A-Za-z_][A-Za-z0-9_]*)/g,
    )) {
      if (
        ref === name ||
        seen.has(ref) ||
        locals.has(ref) ||
        AMBIENT.has(ref)
      ) {
        continue;
      }
      const target = decls.get(ref);
      if (target === undefined || target.line <= decl.line) {
        continue;
      }
      seen.add(ref);
      report(
        `${file}:${decl.line + 1}  [late ${target.kind}] ${name} -> ${ref} ` +
          `declared at line ${target.line + 1} — captured as undefined on the UI thread`,
      );
    }

    // Class 3: a call to a function that is not worklet-marked.
    for (const [, callee] of body.matchAll(
      /(?<![.\w])([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    )) {
      if (
        callee === name ||
        seen.has(callee) ||
        locals.has(callee) ||
        AMBIENT.has(callee)
      ) {
        continue;
      }

      const local = decls.get(callee);
      if (local !== undefined) {
        if (local.kind === "fn" && !local.isWorklet) {
          seen.add(callee);
          report(
            `${file}:${decl.line + 1}  [no directive] ${name} -> ${callee} ` +
              `(local, line ${local.line + 1}) — needs a "worklet" directive`,
          );
        }
        continue;
      }

      const spec = imports.get(callee);
      if (spec === undefined) {
        continue;
      }
      const mod = resolveModule(abs, spec);
      const exported = mod?.decls.get(callee);
      if (
        exported !== undefined &&
        exported.kind === "fn" &&
        !exported.isWorklet
      ) {
        seen.add(callee);
        report(
          `${file}:${decl.line + 1}  [no directive] ${name} -> ${callee} ` +
            `(imported from ${spec}) — needs a "worklet" directive`,
        );
      }
    }
  }
}

console.log(
  total === 0
    ? "check-worklet-order: clean — no worklet reaches a late-declared binding or an unmarked function"
    : `check-worklet-order: ${total} finding(s) — each is undefined or a remote-function throw on the UI thread`,
);

process.exit(total === 0 ? 0 : 1);
