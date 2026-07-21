# Boot-splash canvas draws — maintainer's guide

This folder holds the `client-react` **shell** for the full-screen "boot
sequence" splash — `BootGate.tsx` and `BootSequence.tsx` (the React host + the
rAF loop) plus `BootSequence.test.tsx`. The canvas draw engine itself — the
part this note is really about — lives one level out, in the framework-free
`@rtc/boot-splash` package (`packages/boot-splash/src/`): `bootCanvas.ts`
(shared helpers + the `laser` & `docking` draws), `variants/boot{Core,Hologram,
Geo,Layers,Jarvis,Topo}.ts` (the six 3D scene draws), `bootSplashGate.ts` (the
reduced-motion/webdriver gate), and the two `*.module.css` stylesheets. Both
web clients (`client-react` here, and `client-solid`) import that package and
supply their own thin shell on top — this file documents the shared engine
that both shells rely on, wherever it lives.

For *what the animations are and how each effect is drawn*, read the deep dive:
[`docs/boot-splash-animations.md`](../../../../../../docs/boot-splash-animations.md).
This file is only about **editing the draw code without breaking it**.

## What's here (and what moved to `@rtc/boot-splash`)

| File | Lives in | Kind | Tested? |
|------|----------|------|---------|
| `BootGate.tsx`, `BootSequence.tsx` | here (`client-react`) | React shell + the rAF loop | yes — `BootSequence.test.tsx` + the UI contract |
| `bootCanvas.ts` | `packages/boot-splash/src/` | shared helpers + the `laser` & `docking` draws | **no** |
| `variants/boot{Core,Hologram,Geo,Layers,Jarvis,Topo}.ts` | `packages/boot-splash/src/variants/` | the six 3D scene draws | **no** |
| `bootSplashGate.ts` | `packages/boot-splash/src/` | reduced-motion/webdriver gate | yes — `bootSplashGate.test.ts` |
| `BootGate.module.css`, `BootSequence.module.css` | `packages/boot-splash/src/styles/` | styles | via visual goldens |

The engine, gate, and CSS are consumed via `@rtc/boot-splash` (source imports)
and `@rtc/boot-splash/styles/*` (the CSS Modules export) — see that package's
`src/index.ts` for the full export list. `client-solid` has no README of its
own for this; this file is the one maintainer's guide for the shared engine.

## Why the draw code is dangerous to touch

The draw functions are **canvas 2D pixel code with no rendering tests**. jsdom
never runs a `requestAnimationFrame` frame and never gets a real 2D context, so:

- **Vitest, the UI contract, and the visual goldens exercise none of it.** The
  splash is also suppressed under `navigator.webdriver`, so Playwright never sees
  it either.
- **TypeScript is the only automatic net, and it is not enough.** `tsc` happily
  accepts a `0.42` you fat-fingered into `0.24`, or a `ctx.stroke()` you dropped —
  both silently change the animation.
- The code is **dense and almost entirely magic numbers** — phase windows, radii,
  alphas, easing spans. The numbers *are* the behaviour. It was ported "verbatim"
  from a design prototype, so there is no spec to diff against either.

So any edit here needs a verification strategy beyond "types pass."

## The frozen contract — names you must NOT rename

The identifiers were deliberately made readable (see the glossary below), but some
names are a **contract across files** and must stay exactly as they are:

- **Exports / imports:** `BOOT_DURATION_MS`, `hexToRgba`, `ease`, `drawBootLaser`,
  `drawBootDocking`, the `createBoot*` factories, and the types `BootDrawCtx` /
  `BootFrameFn`.
- **`BootDrawCtx` field names:** `canvas`, `ctx`, `start`, `accent`, `accent2`,
  `buy`, `sell`, `pointer`, and inside `pointer` → `mx`, `my`. These are written by
  `BootSequence.tsx` and read by every scene. (You may add a readable *local*
  alias, e.g. `const accent = scene.accent`, but the field name stays.)

Local variables, parameters, and locally-declared helpers are free to rename.

## The safe-rename / safe-edit technique: a fingerprint verifier

A **pure rename** (or any change that is *supposed* to preserve behaviour) must
leave the program's literal + operation skeleton untouched — only identifiers move.
For canvas code that skeleton is two ordered sequences:

1. every **numeric literal** (the geometry / timing constants), and
2. every **canvas drawing op / state assignment** (`beginPath`, `arc`,
   `fillStyle =`, …), in order.

If both sequences are byte-identical before and after your edit, you did not change
any constant or any draw call — the pixels are provably unchanged. This is what
verified the big rename ([PR #197](https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/197)):
all seven files came back identical on both sequences.

### The script

Save this as e.g. `verify-boot-rename.mjs` (in your scratch dir, or wire it into
`scripts/` if you want it permanent), then run it against `HEAD` vs. your working
tree. It reads the original with `git show HEAD:<path>`, so **commit or stash the
known-good version first**, then edit, then run.

```js
#!/usr/bin/env node
// Fingerprint verifier for identifier-only / behaviour-preserving edits to the
// boot canvas draws. Proves that no numeric literal and no canvas operation
// changed — only identifiers. Usage:
//   node verify-boot-rename.mjs <repoRoot> <relpath> [<relpath> ...]
// e.g. node verify-boot-rename.mjs . packages/boot-splash/src/variants/bootCore.ts

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const [repoRoot, ...files] = process.argv.slice(2);

// Strip // and /* */ comments so numbers in comments (prototype line refs like
// "888-921") don't count. No // or /* appears inside string literals here.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

// Numeric literals NOT part of an identifier — the digits in k2 / ac2 / P3 /
// 1e-9 are excluded because they follow a word char or dot.
const NUM_RE = /(?<![\w$.])\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?/g;

// Canvas ops + mutable state props, receiver-independent (so renaming `ctx` or a
// helper param never trips it). The `(?=\s*[(=][^=])` lookahead requires an
// actual call `(` or assignment `=`, so a renamed STRUCT FIELD that happens to
// share a canvas-method name (e.g. `fragment.scale`) is NOT mistaken for
// `ctx.scale()`.
const CANVAS_TOKEN_RE =
  /\.(fillRect|strokeRect|clearRect|beginPath|closePath|moveTo|lineTo|arc|arcTo|rect|ellipse|bezierCurveTo|quadraticCurveTo|stroke|fill|clip|save|restore|translate|rotate|scale|transform|setTransform|setLineDash|fillText|strokeText|measureText|createRadialGradient|createLinearGradient|createPattern|addColorStop|drawImage|getContext|fillStyle|strokeStyle|lineWidth|globalAlpha|shadowBlur|shadowColor|shadowOffsetX|shadowOffsetY|font|textAlign|textBaseline|lineJoin|lineCap|miterLimit|globalCompositeOperation)\b(?=\s*[(=][^=])/g;

function fingerprint(src) {
  const clean = stripComments(src);
  return {
    nums: clean.match(NUM_RE) ?? [],
    ops: (clean.match(CANVAS_TOKEN_RE) ?? []).map((s) => s.slice(1)),
  };
}

function firstDiff(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return { i, a: a[i], b: b[i] };
    }
  }
  return null;
}

let anyFail = false;

for (const rel of files) {
  const original = execFileSync("git", ["show", `HEAD:${rel}`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const working = readFileSync(join(repoRoot, rel), "utf8");
  const fo = fingerprint(original);
  const fw = fingerprint(working);
  const numDiff = firstDiff(fo.nums, fw.nums);
  const opDiff = firstDiff(fo.ops, fw.ops);

  if (numDiff === null && opDiff === null) {
    console.log(
      `PASS  ${rel}  (${fo.nums.length} numbers, ${fo.ops.length} canvas ops preserved)`,
    );
    continue;
  }

  anyFail = true;
  console.log(`FAIL  ${rel}`);
  if (numDiff) {
    console.log(
      `        number #${numDiff.i}: HEAD ${JSON.stringify(numDiff.a)} -> working ${JSON.stringify(numDiff.b)}`,
    );
  }
  if (opDiff) {
    console.log(
      `        canvas-op #${opDiff.i}: HEAD ${JSON.stringify(opDiff.a)} -> working ${JSON.stringify(opDiff.b)}`,
    );
  }
}

process.exit(anyFail ? 1 : 0);
```

### Using it

```bash
# 1. Make sure the good version is committed (the script diffs against HEAD).
# 2. Do your rename / "behaviour-preserving" edit.
# 3. Fingerprint every file you touched:
node verify-boot-rename.mjs . \
  packages/boot-splash/src/bootCanvas.ts \
  packages/boot-splash/src/variants/bootCore.ts
# Expect PASS on each. A FAIL prints the first differing number or draw call.
```

**Sanity-check the script itself first:** run it with *no* edits in the working
tree — every file must `PASS`. That confirms the regexes aren't producing false
positives on your current code before you trust a `PASS` on an edit.

**Two known gotchas the current regexes already handle**, worth knowing if you
extend the script:

- Digits inside identifiers (`k2`, `ac2`, `P3`, `1e-9`) must not count as numeric
  literals — the `(?<![\w$.])` guard excludes them.
- A struct field named like a canvas method (`fragment.scale`) must not be counted
  as a draw op — the `(?=\s*[(=][^=])` lookahead requires a real call/assignment,
  not a field read.

## Checklist for editing a draw file

- [ ] **Renaming only?** Change identifiers, nothing else. Run the fingerprint
      verifier → every touched file must `PASS`.
- [ ] **Actually changing the animation?** The verifier *will* (correctly) FAIL —
      that's expected. Change **one constant at a time** and watch it in the app;
      don't bulk-edit numbers.
- [ ] Respect the frozen contract names above.
- [ ] `pnpm typecheck`, `pnpm exec biome ci <files>`, `pnpm exec eslint <dir>` —
      all green.
- [ ] **Look at it.** `pnpm dev`, then cycle the eight scenes by hard-reloading or
      using the Account-menu **⟳ Reboot** row (the variant advances each time).
      This is the only real test the pixels get.

## Reduced-motion gates and the `forceBootAnimation` override

The boot splash is **suppressed** in two accessibility cases:

1. **`prefers-reduced-motion: reduce`** — the standard OS/browser setting for
   motion-sensitive users and remote desktop / VDI environments (e.g. Citrix,
   which can't composite canvas fast enough). The splash skips canvas draw
   entirely and the opacity transition disables via `@rtc/boot-splash`'s
   `BootSequence.module.css` `@media (prefers-reduced-motion: reduce)` rules.

2. **`!ctx` — no 2D graphics context** — when `canvas.getContext("2d")` returns
   null (jsdom in tests, Chrome GPU-less). The canvas never starts the rAF loop;
   only the text chrome renders.

Both gates are **hardcoded safety floors** — they cannot be overridden by URL or
preference to prevent jank on inaccessible setups.

### The `forceBootAnimation` preference

Users who disable reduced motion in their OS but still want the boot splash can
override reduced-motion via a persisted **`forceBootAnimation`** boolean (default
off). The toggle is wired as a checkbox in the Preferences dialog's **DISPLAY**
column: "Always play boot animation".

When enabled, reduced-motion's suppression is bypassed: the effective
reduced-motion state becomes `prefersReduced && !forced` (in this folder's
`BootSequence.tsx` and `BootGate.tsx`). The CSS restores the animation via a
`data-force-anim="true"` attribute on the boot root (`.boot` in
`@rtc/boot-splash`'s `BootSequence.module.css`), which the `@media` rule's
`:not([data-force-anim="true"])` selector carves out — negating the
suppression rules only when forced.

The preference takes effect on the **next page reload**, since the splash paints
during composition before the user can open Preferences. Alternatively, the
account menu's **⟳ Reboot HUD** row calls `BootGatePresenter.reboot()` to
re-raise the boot gate and remount `BootSequence` immediately, advancing the
boot variant with each call.

The `!ctx` floor **cannot be forced** — there is no 2D surface to draw on.

### The `?splash` URL override

URL parameter `?splash` forces the splash ON even under `navigator.webdriver`
(browser automation in Playwright / Cypress). Symmetric to the existing `?nosplash`
force-off for humans. Used by e2e tests that want to exercise the splash under
automation (in `bootSplashGate.ts`).

## Glossary (the readable names, so edits stay consistent)

`scene` = the `BootDrawCtx` · `ctx` = 2D context · `elapsedSec` = free-running
seconds · `progress` = 0→1 over ~4.2 s · `width`/`height` · `centerX`/`centerY` ·
`accent`/`accentAlt` · `project(x,y,z)` = the 3D→2D projection · `perspective` =
the foreshortening factor · `flickerAlpha` = the hologram shimmer · `hashRandom` =
deterministic seeded pseudo-random · `pointerX`/`pointerY` = cursor, −1..1.
