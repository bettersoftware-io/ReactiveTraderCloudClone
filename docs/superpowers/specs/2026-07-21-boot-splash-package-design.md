# Design: extract the duplicated boot-splash into `@rtc/boot-splash`

**Status:** approved (brainstorming) — ready for implementation plan
**Date:** 2026-07-21
**Author:** pairing session

## Problem

The boot / splash animation is **copy-pasted** between `@rtc/client-react` and
`@rtc/client-solid`. Both packages carry a mirror-image
`src/ui/shell/boot/` tree plus a top-level `bootSplashGate.ts`. The two copies
run the **same algorithm with the same numeric constants** — they have diverged
only in identifier *names* (React uses readable names like `globeRadius`,
`elapsedSec`; Solid uses terse ones like `S`, `t`). Proof gathered during
brainstorming:

- `bootCore.ts` float-constant fingerprints are byte-identical across the two
  clients (`md5 80bdaecc…`); the only diffs are variable renames
  (`Math.min(width, height) * 0.24` vs `Math.min(W, H) * 0.24`).
- `BootSequence.module.css`, `BootGate.module.css`, `bootSplashGate.ts`, and
  `bootSplashGate.test.ts` are **byte-identical** across the two clients.

### Duplicated surface (measured)

| File | LOC | React vs Solid |
|------|-----|----------------|
| `ui/shell/boot/bootCanvas.ts` | 1,021 | duplicated (renamed only) |
| `ui/shell/boot/variants/bootLayers.ts` | 638 | duplicated |
| `ui/shell/boot/variants/bootGeo.ts` | 968 | duplicated |
| `ui/shell/boot/variants/bootHologram.ts` | 617 | duplicated |
| `ui/shell/boot/variants/bootTopo.ts` | 711 | duplicated |
| `ui/shell/boot/variants/bootJarvis.ts` | 894 | duplicated |
| `ui/shell/boot/variants/bootCore.ts` | 608 | duplicated |
| **canvas engine subtotal** | **~5,457** | **copy-pasted** |
| `bootSplashGate.ts` | 38 | byte-identical |
| `bootSplashGate.test.ts` | — | byte-identical |
| `ui/shell/boot/BootSequence.module.css` | 128 | byte-identical |
| `ui/shell/boot/BootGate.module.css` | 6 | byte-identical |
| `ui/shell/boot/BootSequence.tsx` | 203 / 223 | **framework-specific — stays per-client** |
| `ui/shell/boot/BootGate.tsx` | 65 / 62 | **framework-specific — stays per-client** |
| `ui/shell/boot/BootSequence.test.tsx` | — | **framework-specific — stays per-client** |

The engine is already built around a seam: the six `variants/*.ts` files
reference **zero** DOM types — they draw only through a `BootDrawCtx` interface
handed to them. Only `bootCanvas.ts` names DOM types, and only in *type*
position (`HTMLCanvasElement`, `CanvasRenderingContext2D`). There is **no**
`document.` / `window.` / `requestAnimationFrame` runtime DOM in the engine —
the rAF loop lives in each `.tsx` shell. The engine has **no `@rtc/*`
imports** and no external runtime imports at all.

## Goal

One canonical, framework-free home for the boot-splash feature; both clients
consume it; the duplicated copies are deleted. No behavioural change — the
splash must render pixel-identically in both clients (witnessed by the visual
golden tier).

## Decision: a new package `@rtc/boot-splash`

Rejected alternatives (from brainstorming):

- **Fold into `@rtc/motion-core`.** motion-core is a deliberately-guarded
  *pure motion-math, no-DOM* leaf (its `reducedMotion.ts` keeps even
  `window.matchMedia` out, holding only the query string). The boot engine is a
  ~5.4k-LOC canvas **renderer** — it would be ~83% of the package and flip its
  identity from "motion math" to "the boot renderer plus some math." The "no
  DOM" rule there is convention-only (no compiler/lint enforcement — TS default
  `lib` already includes DOM), so folding in would erode a bright line with no
  backstop. Rejected.
- **`@rtc/motion-core/boot` subpath.** Keeps the `.` export DOM-free but still
  lives "inside motion-core"; extra export/build config for a thing that is
  conceptually its own package. Rejected in favour of a clean dedicated package.

`@rtc/boot-splash` is honestly scoped as **the whole framework-free boot-splash
feature**: the canvas engine + the play-decision gate + the shared styles. It is
a zero-`@rtc`-dependency leaf. Note it is **not** a "no-DOM" leaf like
motion-core — it legitimately touches runtime DOM in the gate
(`navigator.webdriver`, `window.location`) and canvas types in the engine. Its
dependency-cruiser rule therefore polices **package dependencies only** (must
not import any `@rtc/*`), and does *not* claim "no DOM."

### Naming

- **Package:** `@rtc/boot-splash`. Single-word-ish names already exist in the
  family (`@rtc/domain`, `@rtc/shared`, `@rtc/server`); `boot-splash` keeps both
  the code vocabulary ("boot") and the user-facing word ("splash"), mirroring
  the existing `bootSplashGate.ts` that already marries them.
- **Symbols/filenames stay `boot*`** (`BootDrawCtx`, `createBootCore`,
  `drawBootLaser`, `bootCanvas.ts`, `variants/bootCore.ts`, …). With the package
  named `boot-splash`, exporting `Boot*` symbols reads as consistent — no rename
  is needed. A `boot`→`splash` identifier rename, if ever wanted for clarity, is
  an **optional Pass 2** (see below), not part of this work.

## Package shape

```
packages/boot-splash/
  src/
    bootCanvas.ts              BootDrawCtx / BootFrameFn seam + shared draws
    variants/
      bootCore.ts  bootGeo.ts  bootHologram.ts
      bootJarvis.ts  bootLayers.ts  bootTopo.ts
    bootSplashGate.ts          shouldPlayBootSplash() (runtime DOM: navigator/location)
    bootSplashGate.test.ts     (moved verbatim — pure TS, node-env)
    styles/
      BootSequence.module.css  (moved verbatim, identical across clients)
      BootGate.module.css      (moved verbatim, identical across clients)
    index.ts                   re-exports the TS public surface
  package.json                 @rtc/boot-splash, zero runtime deps
  tsconfig.json                mirrors motion-core (tsc --build && tsc-alias)
  vitest.config.ts             node env (matches the gate test)
  README.md
```

**Canonical source = the verbose React copy.** The React files are lifted
verbatim; the Solid terse copy is discarded. Constants + canvas ops are already
proven identical, so nothing behavioural is lost.

**Public TS API** (exactly what both `.tsx` shells + `buildBrowserPorts.ts`
import today, unchanged):

- from the engine: `type BootDrawCtx`, `type BootFrameFn`, `drawBootLaser`,
  `drawBootDocking`, and `createBoot{Core,Geo,Hologram,Jarvis,Layers,Topo}`
- from the gate: `shouldPlayBootSplash`

## Consumer rewiring

Per client (`client-react`, `client-solid`), all pointing at the identical
canonical copy:

1. `BootSequence.tsx` — swap the 7 relative engine imports (`./bootCanvas`,
   `./variants/*`) for a single `@rtc/boot-splash` import. Swap the
   `./BootSequence.module.css` import for the boot-splash-hosted stylesheet.
2. `BootGate.tsx` — swap `./BootGate.module.css` for the boot-splash-hosted
   stylesheet.
3. `app/buildBrowserPorts.ts` — import `shouldPlayBootSplash` from
   `@rtc/boot-splash` instead of the local `bootSplashGate`.
4. Add `@rtc/boot-splash` to each client's `package.json` dependencies.
5. **Delete the duplicated originals** — per client: `bootCanvas.ts`, the six
   `variants/*.ts`, `bootSplashGate.ts`, `bootSplashGate.test.ts`, and the two
   `*.module.css` (11 files per client × 2 clients = 22 deletions). The `.tsx`
   shells and `BootSequence.test.tsx` stay.

### CSS-module cross-package wrinkle (known task for the plan)

The `.module.css` files are consumed by each client's Vite build. `tsc` (the
boot-splash build) does not emit CSS, so the stylesheets must be reachable by
the consuming Vite build from source — via a package `exports` subpath that
points at `src/styles/*.css` (Vite processes CSS modules from dependencies).
Class-name hashes may change, but goldens compare pixels (and contract tests key
on `data-testid`), so rendering is unaffected. The plan must verify both Vite
clients resolve and hash the shared stylesheet correctly.

## Correctness strategy (two passes)

**Pass 1 (this work) — identifier-preserving move.** Lift the verbose React
copies verbatim. Prove no logic drift with the repo's **fingerprint-verifier**
playbook (`reference_safe_rename_fingerprint_verifier`): diff the ordered
numeric-literals + canvas-op sequence of each boot-splash file against its React
original at the base commit → identical fingerprint proves the move is
byte-faithful (whitespace/formatting aside). This is fingerprint-verifiable
precisely *because* identifiers are preserved.

**Pass 2 (optional, deferred, out of scope).** If a `boot`→`splash` identifier
rename is ever desired, do it as a separate mechanical pass with its own
fingerprint check. Not required — `@rtc/boot-splash` already makes `Boot*`
symbols read consistently.

### End-to-end witness

The **visual golden tier** (`@rtc/ui-contract` boot scenarios, asserted against
both clients) is the behavioural oracle: both clients must still render
pixel-identical splashes after the move. The migrated `bootSplashGate.test.ts`
(node-env) covers the play-decision logic. The framework `BootSequence.test.tsx`
in each client continues to exercise the shell.

## New-package gate wiring (repo invariant: every gate covers every package)

- **dependency-cruiser** — add `boot-splash` to the pure-leaf path allowlists,
  and add a `boot-splash-stays-pure` rule (mirroring `motion-core-stays-pure`)
  forbidding any `@rtc/*` import from `packages/boot-splash/src`. Add the two
  clients' new `→ @rtc/boot-splash` edge where the allowed-dependency lists are
  enumerated.
- **knip** — add the package entry/config so unused-export analysis covers it.
- **ESLint** — add `packages/boot-splash` to `tsconfig.eslint.json` include and
  any name-specific config paths.
- **TypeScript project refs** — add boot-splash to the root/solution tsconfig
  references; add the `@rtc/boot-splash` path mapping where clients resolve
  workspace deps for typecheck.
- **Biome / turbo / pnpm-workspace** — pick the package up by glob
  automatically; verify, don't hand-wire.
- **syncpack** — single version range for the new workspace dep.

## Scope boundary

**In:** the canvas engine (`bootCanvas.ts` + 6 variants), `bootSplashGate.ts`
(+ its test), the two `.module.css` files, the new package + its gate wiring,
consumer rewiring, deletion of duplicates.

**Out:** the `.tsx` shells and `BootSequence.test.tsx` (genuinely
framework-specific — stay per-client). Any `boot`→`splash` identifier rename
(optional Pass 2). Any behavioural change to the animation.

## Risks

- **CSS cross-package resolution** (above) — the one non-mechanical unknown;
  proven by running both Vite clients + the visual goldens.
- **Base moved to #311** (visual CI now a react/solid job matrix). This change
  touches package structure + client imports; watch the visual matrix at merge
  and catch up if the incoming diff overlaps package/tsconfig/visual wiring.
