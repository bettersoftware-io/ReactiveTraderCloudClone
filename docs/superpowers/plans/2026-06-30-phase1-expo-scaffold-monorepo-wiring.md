# Phase 1 — Expo scaffold + monorepo wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `@rtc/client-react-native` Expo Router app to the monorepo, solve the Metro / pnpm / `#/`-alias plumbing, and render the currency-pair list from `@rtc/client-core` off the simulator port — proving framework-neutral-core resolution end-to-end on the React Native bundler.

**Architecture:** A thin Expo Router + TypeScript app package that consumes the already-built `@rtc/client-core` **`dist`** (no Metro transpilation of sibling TS). Metro is configured for the pnpm monorepo (`watchFolders` → workspace root, `nodeModulesPaths`, symlinks + package-`exports`); the app's own `#/` subpath alias resolves via `babel-plugin-module-resolver`. EAS configuration is committed but `eas login`/`eas init` (account-bound) is deferred to the start of Phase 2. The whole exercise's value is *failing fast on the toolchain* before any feature work, so every step ends by re-proving the full repo gate gauntlet stays green.

**Tech Stack:** Expo SDK 57 (latest) + Expo Router, React Native, React 19, TypeScript 6, Metro, pnpm 11 workspaces, Turborepo, vitest (node env for the data unit test).

## Reference

- **Spec:** `docs/superpowers/specs/2026-06-29-react-native-expo-client-design.md` (§1 topology, §2 walking skeleton, §4 toolchain & phasing — Phase 1 row).
- **Phase 0 (merged):** `docs/superpowers/plans/2026-06-29-phase0-client-core-extraction.md` — produced `@rtc/client-core` + `@rtc/react-bindings`.

## Global Constraints

Every task's requirements implicitly include this section. Exact values, copied from the repo's live config:

- **Node 26, pnpm 11.8.0** (`packageManager` pin). Never set `node-linker=hoisted` — the strict symlinked `node_modules` is load-bearing and Metro is configured around it.
- **Supply-chain cooldown:** `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` (refuse any version published < 24h ago). If `pnpm install` of an Expo package is refused for being too fresh, add that package to a `minimumReleaseAgeExclude` list in `pnpm-workspace.yaml` **only as a last resort**; first prefer the latest patch that clears the 24h window. Verify chosen versions with `pnpm outdated -r` afterward.
- **Biome (`biome.jsonc`) is the formatter+linter — zero findings, NO inline `biome-ignore` disables.** Repo-wide rules that hit RN code: `noDefaultExport: error` (exempt only `*.config.*`/`*.d.ts`/`middleware.ts` — Expo Router routes need a scoped override), `style/useComponentExportOnlyModules`, `suspicious/noLeakedRender` (no `cond && <JSX>`), `suspicious/noUndeclaredEnvVars`, `nursery/useExplicitType` (every function/component needs an explicit return type), `style/noRestrictedImports` banning `../../**` (use `#/`). Formatter: 2-space indent, 80 col, LF, double quotes, semicolons, trailing commas.
- **`#/` subpath alias is the import convention.** Anything ≥2 levels up MUST use `#/` (→ `./src/*`). Declare it in the package's `package.json` `imports` AND `tsconfig.json` `paths` AND (for Metro runtime) `babel-plugin-module-resolver`.
- **syncpack single-version-range:** a dependency must use one identical range string across the whole workspace. `react`, `react-dom`, `@types/react`, `@types/react-dom` MUST be `^19` (matching `@rtc/client-react`). Workspace deps use `workspace:*`. Run `pnpm check:versions` (manypkg + syncpack) to verify.
- **Dependency rule:** apps never depend on each other. `@rtc/client-react-native` may depend on `@rtc/client-core`, `@rtc/domain` (and later `@rtc/react-bindings`), never on `@rtc/client-react`. `pnpm check:deps` (dependency-cruiser) enforces it.
- **CI gauntlet (the merge gate)** — `.github/workflows/ci.yml` `checks` job runs, in order: `biome ci .`, `pnpm lint:eslint` (AST), `pnpm test:rules`, `pnpm lint:css`, `pnpm lint:actions`, `pnpm check:versions`, `pnpm typecheck`, `pnpm test`, client-react contract coverage, `pnpm build`, `pnpm lint:dead` (knip), `pnpm check:deps`, `pnpm lint:eslint:types`, `pnpm --filter @rtc/tests gates` (grep gates + `pnpm audit --prod`). **Every task ends green on the full local gauntlet** (see "Verification gauntlet" below).
- **EAS scope:** commit `eas.json` + app-config Update fields + channels, but do NOT run `eas login`/`eas init` (account-bound, interactive). The real `projectId`/`updates.url` are filled by the user via `! eas init` at the start of Phase 2; the plan leaves documented placeholders.

### Verification gauntlet (run from repo root unless noted)

```bash
pnpm install                       # lockfile updates; must succeed under the cooldown
pnpm exec biome ci .               # gate 1 — formatter + linter
pnpm lint:eslint                   # gate 2 — AST rules
pnpm check:versions                # gate 6 — manypkg + syncpack
pnpm typecheck                     # gate 7 — turbo run typecheck (incl. RN tsc --noEmit)
pnpm test                          # gate 8 — turbo run test (incl. RN data unit test)
pnpm build                         # gate 10 — turbo run build (libs → dist)
pnpm lint:dead                     # gate 11 — knip
pnpm check:deps                    # gate 12 — dependency-cruiser
pnpm lint:eslint:types             # gate 13 — type-aware ESLint
pnpm --filter @rtc/tests gates     # gate 14 — grep gates + pnpm audit --prod
pnpm --filter @rtc/client-react-native export   # Phase-1 proof — Metro bundles a native JS bundle
```

`expo export` is the headless stand-in for "render on a device": Metro bundles the app's JS for a native target **without** Xcode/a simulator, so a green export proves resolution. This sandbox is arm64 macOS, Node 26, no watchman (Metro falls back to node fs watching — fine for a one-shot export).

---

## File Structure

All new files live under `packages/client-react-native/` unless noted.

| File | Responsibility |
|---|---|
| `package.json` | Package manifest: name `@rtc/client-react-native`, scripts (`typecheck`/`test`/`build`/`export`/`clean`/`start`), deps (repo-range-normalized), `imports` `#/*` → `./src/*`. |
| `tsconfig.json` | Extends `expo/tsconfig.base` (RN/JSX-correct, NOT the repo's tsc-build base); `paths` `#/*`; `noEmit` typecheck only. |
| `app.config.ts` | Expo app config (name, slug, scheme, `newArchEnabled`, `updates`, `runtimeVersion` policy, `extra.eas.projectId` placeholder). Default-export allowed (`*.config.*`). |
| `metro.config.js` | Monorepo Metro: `watchFolders` → workspace root, `nodeModulesPaths`, symlinks + package-`exports`. CommonJS. |
| `babel.config.js` | `babel-preset-expo` + `babel-plugin-module-resolver` aliasing `#` → `./src`. CommonJS. |
| `app/_layout.tsx` | Expo Router root layout (Stack). `export default` (needs biome override). |
| `app/index.tsx` | The one screen: renders the currency-pair list via `#/ui/CurrencyPairsScreen`. `export default`. |
| `src/ui/CurrencyPairsScreen.tsx` | Dumb RN leaf: `<FlatList>` of pairs. Named export. |
| `src/data/currencyPairsStream.ts` | `buildCurrencyPairsStream()` — wires `createSimulatorPorts` → `CurrencyPairsPresenter`. Named export. Unit-tested. |
| `src/data/useCurrencyPairs.ts` | React hook subscribing to the stream. Named export. |
| `src/data/currencyPairsStream.test.ts` | vitest (node env) — asserts the known pairs emit. |
| `vitest.config.ts` | vitest node env, globals. Default-export allowed. |
| `eas.json` | EAS build/update profiles + channels (committable; no projectId). |
| `README.md` | How to run; the deferred `eas login`/`eas init` Phase-2 steps. |
| `.gitignore` | `.expo/`, `dist/`, `*.log`, native build dirs. |

Repo-root files **modified**:

| File | Change |
|---|---|
| `biome.jsonc` | New `overrides` entry: `noDefaultExport: off` for `packages/client-react-native/app/**`. |
| `knip.json` *(new)* | Configure the `@rtc/client-react-native` workspace entry points + implicitly-used deps. |
| `tsconfig.eslint.json` | Add `packages/client-react-native/app/**/*.{ts,tsx}` to `include` (the `src/**` glob already covers `src/`). |
| `.github/workflows/ci.yml` | Add an "Expo bundle smoke" step to the `checks` job after Build. |
| `pnpm-lock.yaml` | Regenerated by `pnpm install`. |

---

## Task 1 — Scaffold `@rtc/client-react-native` and integrate it with every repo gate

**Outcome:** a new Expo Router + TS package that renders a *static* screen, bundles via `expo export`, and leaves the **entire repo gauntlet green**. No workspace imports yet — this task is about a clean-integrating empty shell so Task 2 can focus purely on resolution.

**Files:**
- Create: all of `packages/client-react-native/` except the `src/data/**` and the currency-pair UI (those are Task 2).
- Modify: `biome.jsonc`, `tsconfig.eslint.json`, create `knip.json`, `pnpm-lock.yaml`.

**Interfaces:**
- Produces: a workspace package `@rtc/client-react-native` with scripts `typecheck` (`tsc --noEmit`), `test` (`vitest run --passWithNoTests`), `build` (`tsc --noEmit` no-op placeholder; real bundling is `export`), `export` (`expo export --platform ios --output-dir dist`), `clean`, `start` (`expo start`). The `#/*` → `./src/*` alias is live in package.json `imports`, tsconfig `paths`, and babel module-resolver.
- Consumes: nothing from sibling packages yet.

- [ ] **Step 1 — Create the package directory and manifest.**

Create `packages/client-react-native/package.json`. Normalize ALL versions to repo style after install (Step 3); the ranges below are the targets syncpack will enforce:

```json
{
  "name": "@rtc/client-react-native",
  "version": "0.0.0",
  "private": true,
  "main": "expo-router/entry",
  "imports": {
    "#/*": "./src/*"
  },
  "scripts": {
    "start": "expo start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "build": "tsc --noEmit",
    "export": "expo export --platform ios --output-dir dist",
    "clean": "rm -rf dist .turbo .expo *.tsbuildinfo node_modules/.cache 2>/dev/null || true",
    "clean:deep": "pnpm run clean && (rm -rf node_modules 2>/dev/null || true)"
  },
  "dependencies": {
    "expo": "^57.0.0",
    "expo-constants": "^18.0.0",
    "expo-router": "^57.0.0",
    "expo-status-bar": "^3.0.0",
    "react": "^19",
    "react-dom": "^19",
    "react-native": "^0.81.0",
    "react-native-safe-area-context": "^5.0.0",
    "react-native-screens": "^4.0.0"
  },
  "devDependencies": {
    "@types/react": "^19",
    "typescript": "^6",
    "vitest": "^4"
  }
}
```

> NOTE: the `expo` / `react-native` minor versions above are *targets*; the authoritative versions come from what `npx create-expo-app` / `expo install --fix` resolve for SDK 57 at execution time. After install, REPLACE the exact pins Expo writes with the repo's caret-range style, and force `react`/`react-dom`/`@types/react` to `^19` (syncpack hard-requirement). The `build` script is intentionally `tsc --noEmit` (a no-op placeholder so `turbo run build` has a target that depends on `^build`); the real native bundle is the `export` script.

- [ ] **Step 2 — Add the Turborepo task wiring for the new package.**

The root `turbo.json` is framework-blind and already declares `build`/`typecheck`/`test`/`clean`. No turbo.json change is needed — the new package's scripts are picked up automatically. Confirm by running:

```bash
pnpm turbo run typecheck --dry=json | grep client-react-native
```
Expected: the dry-run JSON lists a `@rtc/client-react-native#typecheck` task. (No file change in this step — it is a verification.)

- [ ] **Step 3 — Install Expo and pin SDK 57; normalize ranges.**

From the package dir, use the Expo installer to resolve an SDK-57-coherent dependency set, then normalize:

```bash
cd packages/client-react-native
# Resolve SDK-coherent versions for the deps already declared:
pnpm install
pnpm exec expo install --fix       # aligns RN/react/expo-* to SDK 57; may rewrite versions
```

Then hand-edit `package.json` so every range matches repo style (caret ranges; `react`/`react-dom`/`@types/react` = `^19`). Re-run from repo root:

```bash
cd ../..
pnpm install
pnpm check:versions
```
Expected: `pnpm check:versions` exits 0 (manypkg + syncpack clean). If syncpack reports a mismatch on `react`/`react-dom`/`@types/react`, fix the RN package's range to `^19`. If `pnpm install` is refused by the cooldown, apply the Global-Constraints remedy.

- [ ] **Step 4 — TypeScript config.**

Create `packages/client-react-native/tsconfig.json` (extends Expo's base, NOT the repo's tsc-build base, because this app is Metro-bundled, never tsc-emitted):

```jsonc
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "paths": {
      "#/*": ["./src/*"]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts"
  ],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5 — Babel + Metro config for the monorepo.**

Create `packages/client-react-native/babel.config.js`:

```js
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "#": "./src",
          },
        },
      ],
    ],
  };
};
```

Add `babel-plugin-module-resolver` to devDependencies (`pnpm add -D babel-plugin-module-resolver` in the package; normalize range). Create `packages/client-react-native/metro.config.js`:

```js
// Learn more: https://docs.expo.dev/guides/monorepo/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so Metro sees workspace-package changes.
config.watchFolders = [workspaceRoot];

// 2. Resolve from app-local AND workspace-root node_modules (pnpm strict layout).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. pnpm symlinks + package "exports" (so @rtc/* resolve to their built dist).
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
```

- [ ] **Step 6 — App config and Expo Router static screen.**

Create `packages/client-react-native/app.config.ts`:

```ts
import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "RTC Mobile",
  slug: "rtc-mobile",
  scheme: "rtcmobile",
  version: "0.0.0",
  orientation: "portrait",
  newArchEnabled: true,
  runtimeVersion: { policy: "appVersion" },
  // EAS Update fields are populated by `eas init` (deferred to Phase 2 start).
  // updates: { url: "https://u.expo.dev/<projectId>" },
  // extra: { eas: { projectId: "<filled by eas init>" } },
  plugins: ["expo-router"],
};

export default config;
```

Create `packages/client-react-native/app/_layout.tsx`:

```tsx
import { Stack } from "expo-router";

export default function RootLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerTitle: "RTC Mobile" }} />;
}
```

Create `packages/client-react-native/app/index.tsx` (static placeholder for Task 1; Task 2 swaps the body for the live list):

```tsx
import { StyleSheet, Text, View } from "react-native";

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "600" },
});

export default function IndexScreen(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>RTC Mobile — Phase 1 scaffold</Text>
    </View>
  );
}
```

- [ ] **Step 7 — `.gitignore` and `expo-env.d.ts`.**

Create `packages/client-react-native/.gitignore`:

```
# Expo / RN
.expo/
dist/
*.log
*.tsbuildinfo
web-build/
# Native
/ios
/android
```

Run `pnpm exec expo customize` is NOT needed; create `packages/client-react-native/expo-env.d.ts` if `expo install` did not (it usually generates it on first `expo start`/`export`):

```ts
/// <reference types="expo/types" />
```

- [ ] **Step 8 — Biome override for Expo Router default exports.**

In `biome.jsonc`, add a new entry to the `overrides` array (place it alongside the existing `*.config.*` override). Expo Router REQUIRES default-exported route components:

```jsonc
{
  // Expo Router routes are framework entry-points: the file-based router
  // discovers each screen by its DEFAULT export, so `app/**` is a scoped
  // exception to the repo-wide noDefaultExport policy (mirrors middleware.ts).
  "includes": ["packages/client-react-native/app/**"],
  "linter": {
    "rules": {
      "style": {
        "noDefaultExport": "off"
      }
    }
  }
}
```

Run `pnpm exec biome ci .`. Expected: exit 0. If biome flags formatting in the new files, run `pnpm exec biome check --write packages/client-react-native` and re-run `biome ci .`.

- [ ] **Step 9 — Knip config for the new workspace.**

Knip currently runs with NO config (defaults). An Expo package's `app/` router entry + several implicitly-used deps (`expo-router`, `expo-constants`, `react-native-screens`, `react-native-safe-area-context`, `react-dom`, `expo-status-bar`) are invisible to knip's defaults. Create `knip.json` at repo root so only the RN workspace is configured (all other workspaces keep their working defaults):

```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "workspaces": {
    "packages/client-react-native": {
      "entry": [
        "app/**/*.{ts,tsx}",
        "app.config.ts",
        "metro.config.js",
        "babel.config.js",
        "vitest.config.ts",
        "expo-env.d.ts"
      ],
      "project": ["**/*.{ts,tsx}"],
      "ignoreDependencies": [
        "expo-router",
        "expo-constants",
        "expo-status-bar",
        "react-dom",
        "react-native-screens",
        "react-native-safe-area-context",
        "babel-plugin-module-resolver"
      ]
    }
  }
}
```

Run `pnpm lint:dead`. Expected: exit 0. Trim `ignoreDependencies` to only what knip actually reports unused (do not over-list — remove any entry knip does not complain about, so a genuinely-dead dep can still surface later).

- [ ] **Step 10 — tsconfig.eslint inclusion for `app/**`.**

The type-aware ESLint umbrella globs `packages/*/src/**` and `packages/*/*.config.ts` — it does NOT cover `app/**`. Under `project` mode, an un-included ts/tsx file is a HARD ERROR. Add to `tsconfig.eslint.json` `include` (after the existing `packages/*/src/**/*.tsx` lines):

```jsonc
    "packages/client-react-native/app/**/*.ts",
    "packages/client-react-native/app/**/*.tsx",
```

- [ ] **Step 11 — Run the full gauntlet; resolve gate fallouts.**

Run every command in "Verification gauntlet" above (except the `export` proof, which Step 12 covers). Likely fallouts and their fixes:
- `pnpm lint:eslint:types` errors that RN files can't resolve `react-native`/`expo-router` types under the DOM-typed umbrella → first confirm `react-native` + `expo-router` are installed (they ship their own types). If the umbrella genuinely can't type RN files, the documented fallback is: exclude `packages/client-react-native/**` from `tsconfig.eslint.json` (`exclude`) AND add `"packages/client-react-native/**"` to the `ignores` block in `eslint.config.mjs`, then give the package a local `eslint-config-expo` lint script. **Prefer inclusion; use the fallback only if inclusion can't be made green.** If you take the fallback, record it as a Minor for the final review (a consistency regression to revisit).
- `pnpm check:deps` (dependency-cruiser) "unresolvable" on `#/` or `react-native` → confirm the package's `package.json` `imports` declares `#/*`; depcruise honors it via bundler resolution. External RN modules resolve normally.
- `pnpm --filter @rtc/tests gates` → the `pnpm audit --prod` sub-gate may surface advisories from the RN dep tree. If so, record the advisory IDs and (only if non-dev-reachable and unavoidable) add a scoped `overrides`/audit handling in `pnpm-workspace.yaml`, mirroring the existing `uuid`/`serialize-javascript` precedent. Do not blanket-ignore.

- [ ] **Step 12 — Prove the standalone bundle.**

```bash
pnpm --filter @rtc/client-react-native export
```
Expected: Metro bundles successfully; `packages/client-react-native/dist/` contains a `_expo/static/js/ios/*.hbc`-or-`.js` bundle and `metadata.json`; exit 0. If Metro can't start without watchman, confirm it falls back (it should); if Node 26 trips a Metro dependency, capture the exact error for the controller — this is the "fail fast" signal Phase 1 exists to surface.

- [ ] **Step 13 — Commit.**

```bash
git add packages/client-react-native biome.jsonc knip.json tsconfig.eslint.json pnpm-lock.yaml
git commit -m "feat(rn): scaffold @rtc/client-react-native Expo Router app + monorepo gate integration"
```

---

## Task 2 — Metro monorepo resolution + render the currency-pair list from `@rtc/client-core`

**Outcome:** the screen renders the live currency-pair list sourced from `@rtc/client-core`'s `createSimulatorPorts` → `CurrencyPairsPresenter`, proving Metro resolves workspace packages (from their built `dist`) AND the app's `#/` alias end-to-end. A node-env unit test locks the data path.

**Files:**
- Create: `src/data/currencyPairsStream.ts`, `src/data/useCurrencyPairs.ts`, `src/data/currencyPairsStream.test.ts`, `src/ui/CurrencyPairsScreen.tsx`, `vitest.config.ts`.
- Modify: `app/index.tsx` (swap the static body for the list), `package.json` (add `@rtc/client-core`, `@rtc/domain`, `rxjs` deps).

**Interfaces:**
- Consumes from `@rtc/client-core`: `createSimulatorPorts(deps: { preferences: PreferencesPort }): TransportPorts` and `class CurrencyPairsPresenter { constructor(referenceData: ReferenceDataPort); readonly pairs$: Observable<readonly CurrencyPair[]> }`.
- Consumes from `@rtc/domain`: `class PreferencesSimulator implements PreferencesPort` (in-memory; confirm it is exported from the `@rtc/domain` barrel — `grep -rn "PreferencesSimulator" packages/domain/src/index.ts`) and the `CurrencyPair` type.
- Produces: `buildCurrencyPairsStream(): Observable<readonly CurrencyPair[]>`, `useCurrencyPairs(): readonly CurrencyPair[]`.

- [ ] **Step 1 — Add the workspace + rxjs deps.**

In `packages/client-react-native/package.json` dependencies add:

```json
    "@rtc/client-core": "workspace:*",
    "@rtc/domain": "workspace:*",
    "rxjs": "^7.8"
```

Run `pnpm install`. Then build the libs so their `dist` exists for Metro to resolve:

```bash
pnpm build
```

- [ ] **Step 2 — Write the failing data unit test.**

Create `packages/client-react-native/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
```

Create `packages/client-react-native/src/data/currencyPairsStream.test.ts`:

```ts
import { firstValueFrom } from "rxjs";

import { buildCurrencyPairsStream } from "#/data/currencyPairsStream";

test("emits the known currency pairs from the simulator port", async () => {
  const pairs = await firstValueFrom(buildCurrencyPairsStream());
  const symbols = pairs.map((pair) => pair.symbol);
  expect(symbols).toContain("EURUSD");
  expect(pairs.length).toBeGreaterThanOrEqual(9);
});
```

- [ ] **Step 3 — Run the test to verify it fails.**

```bash
pnpm --filter @rtc/client-react-native test
```
Expected: FAIL — `buildCurrencyPairsStream` not found.

- [ ] **Step 4 — Implement the stream factory.**

Create `packages/client-react-native/src/data/currencyPairsStream.ts`:

```ts
import type { Observable } from "rxjs";

import { CurrencyPairsPresenter, createSimulatorPorts } from "@rtc/client-core";
import { type CurrencyPair, PreferencesSimulator } from "@rtc/domain";

/**
 * Phase 1 resolution proof: build the currency-pair stream entirely from the
 * framework-neutral core, off the in-memory simulator port. Renders identically
 * on RN and the web client — the whole point of the extraction.
 */
export function buildCurrencyPairsStream(): Observable<readonly CurrencyPair[]> {
  const ports = createSimulatorPorts({ preferences: new PreferencesSimulator() });
  return new CurrencyPairsPresenter(ports.referenceData).pairs$;
}
```

> If `PreferencesSimulator` is NOT exported from `@rtc/domain`'s barrel, either (a) import it from its subpath if exposed, or (b) write a ~15-line in-memory `PreferencesPort` stub in `src/data/inMemoryPreferences.ts` returning `BehaviorSubject`-backed streams for `themeMode$`/`themeSkin$`/`viewMode$`/`animatedBackground$`/`bootVariant$` with no-op setters. Confirm the barrel first.

- [ ] **Step 5 — Run the test to verify it passes.**

```bash
pnpm --filter @rtc/client-react-native test
```
Expected: PASS (1 test).

- [ ] **Step 6 — The React hook.**

Create `packages/client-react-native/src/data/useCurrencyPairs.ts`:

```ts
import { useEffect, useState } from "react";

import type { CurrencyPair } from "@rtc/domain";

import { buildCurrencyPairsStream } from "#/data/currencyPairsStream";

export function useCurrencyPairs(): readonly CurrencyPair[] {
  const [pairs, setPairs] = useState<readonly CurrencyPair[]>([]);
  useEffect(() => {
    const subscription = buildCurrencyPairsStream().subscribe(setPairs);
    return () => subscription.unsubscribe();
  }, []);
  return pairs;
}
```

- [ ] **Step 7 — The dumb RN leaf.**

Create `packages/client-react-native/src/ui/CurrencyPairsScreen.tsx`:

```tsx
import { FlatList, StyleSheet, Text, View } from "react-native";

import type { CurrencyPair } from "@rtc/domain";

import { useCurrencyPairs } from "#/data/useCurrencyPairs";

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24 },
  heading: { fontSize: 18, fontWeight: "600", paddingHorizontal: 16, paddingBottom: 8 },
  row: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  symbol: { fontSize: 16, fontWeight: "500" },
  detail: { fontSize: 12, opacity: 0.6 },
});

function renderPair(pair: CurrencyPair): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.symbol}>{pair.symbol}</Text>
      <Text style={styles.detail}>
        {pair.base}/{pair.terms} · precision {pair.ratePrecision}
      </Text>
    </View>
  );
}

export function CurrencyPairsScreen(): React.JSX.Element {
  const pairs = useCurrencyPairs();
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Currency pairs (from @rtc/client-core)</Text>
      <FlatList
        data={pairs}
        keyExtractor={(pair) => pair.symbol}
        renderItem={({ item }) => renderPair(item)}
      />
    </View>
  );
}
```

> NOTE: keep `renderPair` a named function with an explicit return type (`useExplicitType`). Biome's import-ordering will group `react-native`, then `@rtc/**`, then `#/` — run `biome check --write` if unsure.

- [ ] **Step 8 — Wire the screen into the route.**

Replace the body of `packages/client-react-native/app/index.tsx`:

```tsx
import { CurrencyPairsScreen } from "#/ui/CurrencyPairsScreen";

export default function IndexScreen(): React.JSX.Element {
  return <CurrencyPairsScreen />;
}
```

- [ ] **Step 9 — Prove end-to-end resolution via the bundler.**

```bash
pnpm build
pnpm --filter @rtc/client-react-native export
```
Expected: exit 0 — Metro resolves `@rtc/client-core`, transitively `@rtc/domain` / `@rtc/shared` / `rxjs` / `@rx-state/core` (all from `dist`), AND the app's `#/ui/...` / `#/data/...` aliases. A resolution failure here is the headline Phase-1 risk; capture the exact unresolved-module error for the controller.

- [ ] **Step 10 — Full gauntlet + commit.**

Run the full "Verification gauntlet". Fix any new findings (e.g. biome import-ordering in the new files: `pnpm exec biome check --write packages/client-react-native`). Then:

```bash
git add packages/client-react-native pnpm-lock.yaml
git commit -m "feat(rn): render currency-pair list from @rtc/client-core off the simulator port"
```

---

## Task 3 — EAS config (committable), CI bundle smoke, and docs

**Outcome:** the committable half of EAS is in place (profiles + channels + Update/runtimeVersion fields), CI continuously re-proves Metro resolution via an `expo export` smoke, and the README documents how to run the app and the deferred account-bound `eas init` steps for Phase 2.

**Files:**
- Create: `packages/client-react-native/eas.json`, `packages/client-react-native/README.md`.
- Modify: `packages/client-react-native/app.config.ts` (uncomment/structure Update+runtimeVersion with documented placeholders), `.github/workflows/ci.yml` (smoke step).

**Interfaces:** none consumed/produced in code; this task is config + CI + docs.

- [ ] **Step 1 — EAS profiles + channels.**

Create `packages/client-react-native/eas.json`:

```json
{
  "cli": {
    "version": ">= 16.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development"
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview"
    },
    "production": {
      "channel": "production"
    }
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Step 2 — App-config Update fields with documented placeholders.**

Edit `packages/client-react-native/app.config.ts` to make the deferred fields explicit and self-documenting (still no real projectId):

```ts
  runtimeVersion: { policy: "appVersion" },
  // Filled by `eas init` at the start of Phase 2 (account-bound, run by a human):
  //   updates: { url: "https://u.expo.dev/<projectId>" },
  //   extra: { eas: { projectId: "<uuid from eas init>" } },
```

Run `pnpm typecheck` to confirm the config still type-checks.

- [ ] **Step 3 — CI bundle smoke.**

In `.github/workflows/ci.yml`, in the `checks` job, add a step immediately AFTER the `Build` step (so the libs' `dist` exists):

```yaml
      - name: Expo bundle smoke (Metro monorepo resolution)
        run: pnpm --filter @rtc/client-react-native export
```

> This is the one genuinely-new CI behavior. It continuously proves Phase 1's deliverable. If it proves flaky on the CI runner (Node 26 + Metro), the documented fallback is to move it to its own job with `continue-on-error: false` but `timeout-minutes: 15`, or gate it behind a path filter — record any such change as a Minor for the final review. Do NOT silence it with `continue-on-error: true` (that would make the gate decorative).

- [ ] **Step 4 — README.**

Create `packages/client-react-native/README.md`:

```markdown
# @rtc/client-react-native

React Native (Expo Router) client for ReactiveTraderCloudClone. Consumes the
framework-neutral `@rtc/client-core` verbatim; only the leaf UI + platform
adapters are RN-specific. See `docs/superpowers/specs/2026-06-29-react-native-expo-client-design.md`.

## Run locally

    pnpm build                                   # build the workspace libs (client-core → dist)
    pnpm --filter @rtc/client-react-native start # Metro dev server; open in Expo Go

## Verify the bundle (no device needed)

    pnpm --filter @rtc/client-react-native export

## Monorepo resolution

Metro is configured for pnpm in `metro.config.js` (watchFolders → workspace
root, `nodeModulesPaths`, symlinks + package `exports`). Workspace packages are
consumed from their built `dist`, so run `pnpm build` after changing a lib. The
`#/` alias resolves via `babel-plugin-module-resolver` (`babel.config.js`).

## EAS (deferred — account-bound, run by a human at the start of Phase 2)

`eas.json` (profiles + channels) is committed. To activate EAS Update:

    pnpm dlx eas-cli login          # interactive — your Expo account
    pnpm dlx eas-cli init           # creates the project; writes projectId + updates.url

Then uncomment the `updates`/`extra.eas.projectId` fields in `app.config.ts`
with the values `eas init` prints. The first `eas update --channel preview`
publish is the first colleague-facing demo (Phase 2).
```

- [ ] **Step 5 — Full gauntlet + commit.**

Run the full "Verification gauntlet" once more (the `actionlint` gate `pnpm lint:actions` now matters — it lints the edited `ci.yml`). Then:

```bash
git add packages/client-react-native .github/workflows/ci.yml
git commit -m "feat(rn): commit EAS config + CI bundle smoke + RN package README"
```

---

## Self-Review (controller, before dispatch)

- **Spec coverage (§4 Phase 1 row):** create `packages/client-react-native` ✅ (T1); Expo Router + TS ✅ (T1); solve Metro/pnpm/alias ✅ (T1 metro+babel, T2 proof); render something from `client-core` off the simulator port ✅ (T2); init EAS ✅ *as committable config only* (T3) — the account-bound `eas init` is explicitly deferred per the user's "defer account steps, commit config" decision.
- **Deliberate refinement of the spec to flag in dispatch / final review:** the spec mused that Metro would "transpile the packages' TS source directly (no prebuild)." This plan instead consumes the libs' **built `dist`** (which the monorepo already produces via turbo `^build`), because it is simpler and lower-risk and adds no new build step. Trade-off: changing a lib needs `pnpm build` before its change shows in Metro (no instant core-HMR). If instant core-HMR is wanted later, add a `react-native`/`source` export condition to the libs — out of scope for Phase 1.
- **Type consistency:** `createSimulatorPorts({ preferences })` / `CurrencyPairsPresenter(referenceData).pairs$` / `PreferencesSimulator` match the verified Phase-0 signatures in `packages/client-core/src/adapters/portFactory.ts` and `packages/client-core/src/presenters/CurrencyPairsPresenter.ts`.
- **Placeholder scan:** the only intentional placeholders are the EAS `projectId`/`updates.url` (deferred by design, documented) and the Expo SDK-57 patch versions (resolved by `expo install` at execution). The `renderPair` helper carries an explicit ASCII-identifier note.
```

