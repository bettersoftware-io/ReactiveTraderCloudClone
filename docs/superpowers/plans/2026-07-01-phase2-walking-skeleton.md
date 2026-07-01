# Phase 2 — Walking skeleton (first colleague demo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `@rtc/client-react-native` from a static currency-pair list into a live streaming FX spot-tile grid fed by the deployed Fly server, rendered through the full `createApp` + `@rtc/react-bindings` composition — the first colleague-facing on-device demo.

**Architecture:** Lift the universal `WsAdapter` into `@rtc/client-core`; add a native `buildNativePorts()` (analogue of `buildBrowserPorts`) that wires the real WS stack + an `AsyncStoragePreferencesAdapter`; compose via `createApp` → `createViewModel` → `ViewModelProvider`; render dumb RN leaves (`SpotTile`/`TileGrid`/`ConnectionBanner`) that consume `client-core` presenters through the bridge. Prove it headlessly (`expo export`, unit tests, RNTL SpotTile tests, a local live-WS smoke); the user runs `eas init` + `eas update` for the on-device demo.

**Tech Stack:** Expo SDK 55, React Native 0.83, React 19, RxJS 7, `@rtc/client-core` + `@rtc/react-bindings`, `@react-native-async-storage/async-storage`, `expo-constants`, `@testing-library/react-native` (harness TBD by the Task 2 spike), vitest 4.

**Spec:** `docs/superpowers/specs/2026-07-01-phase2-walking-skeleton-design.md`.

## Global Constraints

Every task's requirements implicitly include this section. Values are exact.

- **Expo SDK 55**, Node 26, pnpm 11.8.0. Never `node-linker=hoisted`. Supply-chain cooldown `minimumReleaseAge: 1440` in `pnpm-workspace.yaml` — new deps must clear the 24h window (use `expo install` for Expo-managed deps to get SDK-compatible versions; if a version is refused as too fresh, pick the latest patch that clears the window; never re-introduce a broad `minimumReleaseAgeExclude`).
- **Biome zero findings, no inline `biome-ignore` disables.** Repo-wide: `noDefaultExport: error` (Expo Router `app/**` routes are the only default-export exception, already configured); `nursery/useExplicitType` (explicit return + param types); `suspicious/noLeakedRender` (no `cond && <JSX>`); `style/noRestrictedImports` bans `../../**` (use `#/`). Formatter: 2-space, 80-col, LF, double quotes, semicolons, trailing commas. 2-space arrow bodies require braces (`arrow-body-style`); type FlatList/callback params with named types (no inline object param types).
- **`#/` alias** (package.json `imports` + tsconfig `paths` + babel `module-resolver` + vitest `resolve.alias`). RN test files import vitest globals explicitly (`import { expect, test } from "vitest"`).
- **syncpack single-range:** `react`/`react-dom`/`@types/react` = `^19`; workspace deps `workspace:*`; sort `dependencies` alphabetically (`manypkg fix`).
- **Dependency rule:** `@rtc/client-react-native` may depend on `@rtc/client-core`, `@rtc/react-bindings`, `@rtc/domain` — never `@rtc/client-react`. `pnpm check:deps` enforces it.
- **`WsAdapter` lift is behavior-preserving:** moving the file must not change its logic; the existing WS contract-test suite in `client-core` and `client-react`'s app tests stay green.
- **CI gauntlet (merge gate)** — every task ends green on the full local gauntlet: `pnpm exec biome ci .`, `pnpm lint:eslint`, `pnpm lint:eslint:types`, `pnpm lint:actions`, `pnpm check:versions`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm lint:dead`, `pnpm check:deps`, `pnpm --filter @rtc/tests gates`, and `pnpm --filter @rtc/client-react-native export`. **Run every one and report its real exit code — do not claim green from a subset** (a Phase 1 implementer misreported this).
- **EAS is not run here.** `eas login`/`eas init`/`eas update` are the user's (account-bound). The plan only edits committable config + docs.

### Verification gauntlet (run from repo root)

```bash
pnpm install
pnpm exec biome ci .            # 1
pnpm lint:eslint               # 2
pnpm lint:eslint:types         # 3
pnpm lint:actions              # 4
pnpm check:versions            # 5
pnpm typecheck                 # 6
pnpm test                      # 7
pnpm build                     # 8
pnpm lint:dead                 # 9
pnpm check:deps                # 10
pnpm --filter @rtc/tests gates # 11
pnpm --filter @rtc/client-react-native export   # 12 (Metro bundles the real-stack app)
```

---

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `packages/client-core/src/adapters/WsAdapter.ts` | 1 | Universal WS transport (moved verbatim from client-react). |
| `packages/client-core/src/index.ts` | 1 | Export `WsAdapter` from the barrel. |
| `packages/client-react/src/app/buildBrowserPorts.ts` | 1 | Import `WsAdapter` from `@rtc/client-core`. |
| `packages/client-react/src/app/adapters/WsAdapter.ts` + `.test.ts` | 1 | Deleted (test moves to client-core). |
| `packages/client-core/src/adapters/WsAdapter.test.ts` | 1 | Moved WsAdapter unit test, re-pointed imports. |
| `packages/client-react-native/vitest.rn.config.ts` **or** jest island | 2 | RNTL harness (spike decides). |
| `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts` + `.test.ts` | 3 | AsyncStorage-backed `PreferencesPort`. |
| `packages/client-react-native/src/app/buildNativePorts.ts` + `.test.ts` | 4 | Native `AppPorts` factory (real + simulator branches). |
| `packages/client-react-native/src/app/AppRoot.tsx` | 4 | `createApp` → `createViewModel` → `ViewModelProvider`. |
| `packages/client-react-native/src/ui/formatPrice.ts` + `.test.ts` | 5 | Pure bid/ask split (ports web `splitPrice`). |
| `packages/client-react-native/src/ui/SpotTile.tsx` (+ RNTL test) | 5 | Dumb tile leaf. |
| `packages/client-react-native/src/ui/TileGrid.tsx` | 6 | `FlatList` of tiles. |
| `packages/client-react-native/src/ui/ConnectionBanner.tsx` | 6 | Connection state banner. |
| `packages/client-react-native/app/index.tsx` | 6 | Screen: grid + banner + sim toggle via `AppRoot`. |
| `packages/client-react-native/app.config.ts` | 6 | `extra` WS URL/token config. |
| `packages/client-react-native/scripts/liveWsSmoke.ts` | 7 | Local live-WS smoke vs the Fly server. |
| `packages/client-react-native/README.md` | 7 | Run/verify/EAS handoff docs. |
| `packages/client-react-native/package.json` | 2–5 | New deps (react-bindings, async-storage, RNTL, etc.). |

---

## Task 1 — Lift `WsAdapter` into `@rtc/client-core`

**Files:**
- Create: `packages/client-core/src/adapters/WsAdapter.ts` (move), `packages/client-core/src/adapters/WsAdapter.test.ts` (move).
- Modify: `packages/client-core/src/index.ts`, `packages/client-react/src/app/buildBrowserPorts.ts`.
- Delete: `packages/client-react/src/app/adapters/WsAdapter.ts`, `packages/client-react/src/app/adapters/WsAdapter.test.ts`.

**Interfaces:**
- Produces: `class WsAdapter implements IWsAdapter { constructor(url: string, options?: { reconnectDelayMs?: number }) }`, exported from `@rtc/client-core`. `IWsAdapter`/`MessageHandler` already live there.

- [ ] **Step 1: Move the file with `git mv` (preserves history).**
```bash
cd packages/client-core/src/adapters && git mv ../../../client-react/src/app/adapters/WsAdapter.ts ./WsAdapter.ts
git mv ../../../client-react/src/app/adapters/WsAdapter.test.ts ./WsAdapter.test.ts
```

- [ ] **Step 2: Re-point the moved file's imports.** In `packages/client-core/src/adapters/WsAdapter.ts`, the import `import type { IWsAdapter, MessageHandler } from "@rtc/client-core";` becomes a sibling import (it now lives *in* client-core):
```ts
import type { IWsAdapter, MessageHandler } from "#/adapters/IWsAdapter";
```
Keep everything else verbatim (the class body is unchanged — it only uses the global `WebSocket`, `JSON`, `ReplaySubject`, `setTimeout`, `console`).

- [ ] **Step 3: Re-point the moved test's imports.** In `packages/client-core/src/adapters/WsAdapter.test.ts`, change the import of the class under test from the old relative path to `#/adapters/WsAdapter`, and any `MockWebSocket.testHelpers` import — if the test used `packages/client-react/src/app/adapters/MockWebSocket.testHelpers.ts`, move that helper too (`git mv` it to `packages/client-core/src/adapters/MockWebSocket.testHelpers.ts` and re-point). Confirm the helper only uses standard globals (it mocks `WebSocket`); if it imports anything DOM-specific, stop and report.

- [ ] **Step 4: Export from the client-core barrel.** In `packages/client-core/src/index.ts`, add (biome will sort):
```ts
export * from "#/adapters/WsAdapter";
```

- [ ] **Step 5: Re-point `buildBrowserPorts`.** In `packages/client-react/src/app/buildBrowserPorts.ts`, remove `import { WsAdapter } from "#/app/adapters/WsAdapter";` and add `WsAdapter` to the existing `@rtc/client-core` import block:
```ts
import {
  type AppPorts,
  buildWsUrl,
  createSimulatorPorts,
  createWsRealPorts,
  incident$,
  reconnect$,
  routeIdleLifecycle,
  WsAdapter,
  WsConnectionEventsAdapter,
} from "@rtc/client-core";
```

- [ ] **Step 6: Build client-core so its `dist` has the new export.**
```bash
pnpm --filter @rtc/client-core build
```
Expected: exit 0; `packages/client-core/dist/adapters/WsAdapter.js` exists.

- [ ] **Step 7: Run the moved test + client-react app tests.**
```bash
pnpm --filter @rtc/client-core test
pnpm --filter @rtc/client-react test:app
```
Expected: both pass (the WsAdapter test now runs under client-core; client-react's `buildBrowserPorts`/idleTeardown tests still pass against the re-pointed import).

- [ ] **Step 8: Run the full gauntlet** (all 12 commands above). Fix any biome import-ordering (`pnpm exec biome check --write packages/client-core packages/client-react`). Confirm `pnpm check:deps` is still green (no new cross-package violation).

- [ ] **Step 9: Commit.**
```bash
git add -A packages/client-core packages/client-react
git commit -m "refactor(core): lift universal WsAdapter into @rtc/client-core"
```

---

## Task 2 — Stand up the RN component-test harness (the fail-fast spike)

**Files:**
- Create: `packages/client-react-native/src/harnessProbe.test.tsx` (a trivial RNTL render test), plus the harness config (`vitest.rn.config.ts` **or** `jest.config.js` + `jest.setup.ts` — the spike decides).
- Modify: `packages/client-react-native/package.json` (add `@testing-library/react-native`, `react-test-renderer` matching `react@19`, and — only on the jest path — `jest`, `jest-expo`, `@types/jest`), the `test` script, and CI wiring if a second runner is introduced.

**Interfaces:**
- Produces: a working command that renders an RN component and asserts on it. Records in the report which harness path was chosen. Later tasks' RN component tests use this harness.

- [ ] **Step 1: Add RNTL + renderer via `expo install`.**
```bash
cd packages/client-react-native
pnpm exec expo install @testing-library/react-native react-test-renderer
```
Normalize the resolved versions to caret ranges; `react-test-renderer` must match the `react@19` line. Re-run `pnpm install` from root and `pnpm check:versions` (expect 0).

- [ ] **Step 2: Write the probe test.** Create `packages/client-react-native/src/harnessProbe.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { expect, test } from "vitest";

test("RNTL renders an RN component and queries it", () => {
  render(<Text>hello-rn-harness</Text>);
  expect(screen.getByText("hello-rn-harness")).toBeTruthy();
});
```

- [ ] **Step 3: SPIKE — try the vitest path first.** Create `packages/client-react-native/vitest.rn.config.ts`:
```ts
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "#/": `${path.resolve(dirname, "src")}/` } },
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.tsx"],
    server: { deps: { inline: [/react-native/, /@react-native/, /@testing-library\/react-native/] } },
    setupFiles: [],
  },
});
```
Run: `pnpm exec vitest run -c vitest.rn.config.ts`.
Expected outcome A (vitest works): the probe passes. If so, this is the harness — `.test.tsx` files run under `vitest.rn.config.ts`, `.test.ts` (node logic) stay under the existing `vitest.config.ts`. Wire both into the package `test` script:
```json
"test": "vitest run && vitest run -c vitest.rn.config.ts"
```

- [ ] **Step 4: If vitest cannot render RN cleanly (Flow/native-module transform errors from importing `react-native`), FALL BACK to a scoped jest-expo island.** Delete `vitest.rn.config.ts`. Add `jest`, `jest-expo`, `@types/jest` (via `pnpm exec expo install jest-expo && pnpm add -D jest @types/jest`, normalized). Create `packages/client-react-native/jest.config.js`:
```js
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["**/*.test.tsx"],
  moduleNameMapper: { "^#/(.*)$": "<rootDir>/src/$1" },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@testing-library/react-native))",
  ],
};
```
Create `packages/client-react-native/jest.setup.ts`:
```ts
import "@testing-library/react-native";
```
Convert the probe test to jest globals (remove the `import { expect, test } from "vitest"` line — jest provides globals; keep it out of the vitest include). Set the `test` script to run both runners:
```json
"test": "vitest run && jest"
```
Ensure the jest `.test.tsx` files are EXCLUDED from `vitest.config.ts` `include` (it already only matches `src/**/*.test.ts`, so `.tsx` won't be double-run — verify).

- [ ] **Step 5: Wire the RN test tier into the repo gates.** Whichever path:
  - `tsconfig.eslint.json`: ensure `packages/client-react-native/src/**/*.tsx` (test + component) are covered (the existing `packages/*/src/**` globs cover `src/`, so `.tsx` tests under `src/` are included — verify `pnpm lint:eslint:types` passes on the probe).
  - `knip.json`: if a jest island is added, add `jest.config.js`/`jest.setup.ts` to the RN workspace `entry` and any jest-only devDeps to `ignoreDependencies` **only if knip flags them**.
  - Biome: the probe `.tsx` must be biome-clean (named test fn, explicit types where required by `useExplicitType` — the probe's `test(...)` callback is an inline callback, exempt like Phase 1's).

- [ ] **Step 6: CI.** In `.github/workflows/ci.yml`, the `checks` job already runs `pnpm test` (which now includes the RN tier via the package `test` script through turbo). On the jest path only, confirm no extra CI system deps are needed (jest-expo runs in node — no browser/xvfb). If a jest run needs a longer timeout, note it but do NOT add `continue-on-error`.

- [ ] **Step 7: Full gauntlet** (all 12). The probe test must run under `pnpm test`. Record the chosen harness path in the report.

- [ ] **Step 8: Commit.**
```bash
git add -A packages/client-react-native .github/workflows/ci.yml knip.json tsconfig.eslint.json
git commit -m "test(rn): stand up @testing-library/react-native harness (<vitest|jest-expo>) + probe"
```

---

## Task 3 — `AsyncStoragePreferencesAdapter`

**Files:**
- Create: `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts`, `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.test.ts`.
- Modify: `packages/client-react-native/package.json` (add `@react-native-async-storage/async-storage`).

**Interfaces:**
- Consumes: `PreferencesPort`, `ThemeModePreference`, `ThemeSkin`, `ViewMode`, `BootVariant` + their defaults/guards from `@rtc/domain` (mirror the names `LocalStoragePreferencesAdapter` imports — read that file for the exact default constants and type-guard names).
- Produces: `class AsyncStoragePreferencesAdapter implements PreferencesPort`. Async-hydrating: seeds each `BehaviorSubject` with a default synchronously, hydrates from AsyncStorage, `.next()`s stored values; `set*` writes through.

- [ ] **Step 1: Add the dep.**
```bash
cd packages/client-react-native && pnpm exec expo install @react-native-async-storage/async-storage
```
Normalize to a caret range; `pnpm install` + `pnpm check:versions` (expect 0). AsyncStorage is Expo-Go-bundled.

- [ ] **Step 2: Write the failing unit test.** Create `AsyncStoragePreferencesAdapter.test.ts` (node env — mock AsyncStorage). Use an in-memory mock:
```ts
import { firstValueFrom } from "rxjs";
import { skip, take } from "rxjs/operators";
import { beforeEach, expect, test, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (k: string) => Promise.resolve(store.get(k) ?? null),
    setItem: (k: string, v: string) => { store.set(k, v); return Promise.resolve(); },
  },
}));

import { AsyncStoragePreferencesAdapter } from "#/app/adapters/AsyncStoragePreferencesAdapter";

beforeEach(() => { store.clear(); });

test("emits the default synchronously on subscribe", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  const first = await firstValueFrom(prefs.viewMode$());
  expect(first).toBeDefined(); // the default ViewMode
});

test("hydrates the stored value after construction", async () => {
  store.set("rtc.viewMode", JSON.stringify("normal")); // use the real storage key + shape from the impl
  const prefs = new AsyncStoragePreferencesAdapter();
  const hydrated = await firstValueFrom(prefs.viewMode$().pipe(skip(1), take(1)));
  expect(hydrated).toBe("normal");
});

test("setViewMode writes through and emits", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  prefs.setViewMode("compact");
  const next = await firstValueFrom(prefs.viewMode$());
  expect(next).toBe("compact");
});
```
> Adjust the storage-key strings + serialized shapes to match the impl you write in Step 4 (mirror `LocalStoragePreferencesAdapter`'s keys where sensible). Use the actual `ViewMode` literal values from `@rtc/domain`.

- [ ] **Step 3: Run it — verify it fails.** `pnpm --filter @rtc/client-react-native test` → FAIL (adapter not found).

- [ ] **Step 4: Implement the adapter.** Mirror `LocalStoragePreferencesAdapter`'s BehaviorSubject-per-axis shape, but async-hydrate. Sketch (fill in all 5 axes + real defaults/guards from domain):
```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type Observable, BehaviorSubject } from "rxjs";
import { distinctUntilChanged } from "rxjs/operators";

import {
  type BootVariant,
  type PreferencesPort,
  type ThemeModePreference,
  type ThemeSkin,
  type ViewMode,
  // + the DEFAULT_* consts and is* guards LocalStoragePreferencesAdapter uses
} from "@rtc/domain";

const KEY = { themeMode: "rtc.themeMode", /* ...one per axis */ } as const;

export class AsyncStoragePreferencesAdapter implements PreferencesPort {
  private readonly themeMode = new BehaviorSubject<ThemeModePreference>(DEFAULT_THEME_MODE_PREFERENCE);
  // ...one BehaviorSubject per axis, seeded with its DEFAULT synchronously

  constructor() {
    this.hydrate(); // fire-and-forget
  }

  private async hydrate(): Promise<void> {
    const raw = await AsyncStorage.getItem(KEY.themeMode);
    if (raw !== null) {
      const parsed = safeParse(raw);
      if (isThemeModePreference(parsed)) this.themeMode.next(parsed);
    }
    // ...repeat per axis
  }

  themeMode$(): Observable<ThemeModePreference> { return this.themeMode.pipe(distinctUntilChanged()); }
  setThemeMode(mode: ThemeModePreference): void {
    void AsyncStorage.setItem(KEY.themeMode, JSON.stringify(mode));
    this.themeMode.next(mode);
  }
  // ...the other four axes identically
}
```
Add a private `safeParse(raw: string): unknown` (try/catch `JSON.parse`, return `undefined` on throw).

- [ ] **Step 5: Run the test — verify it passes.** `pnpm --filter @rtc/client-react-native test` → PASS.

- [ ] **Step 6: Full gauntlet** (biome import-order, `useExplicitType` on every method, `check:versions`, `lint:dead` — AsyncStorage must be a used dep now, so it should NOT need a knip ignore; remove it from `ignoreDependencies` if present and confirm knip stays green).

- [ ] **Step 7: Commit.**
```bash
git add -A packages/client-react-native
git commit -m "feat(rn): AsyncStorage-backed PreferencesPort adapter"
```

---

## Task 4 — `buildNativePorts` + `AppRoot` (composition)

**Files:**
- Create: `packages/client-react-native/src/app/buildNativePorts.ts`, `packages/client-react-native/src/app/buildNativePorts.test.ts`, `packages/client-react-native/src/app/AppRoot.tsx`.
- Modify: `packages/client-react-native/package.json` (add `@rtc/react-bindings`, `@rtc/client-core` if not already a dep, `rxjs`), `packages/client-react-native/app.config.ts` (add `extra` for WS URL/token — full form lands in Task 6; add the field here so the config is read).

**Interfaces:**
- Consumes: from `@rtc/client-core` — `type AppPorts`, `buildWsUrl`, `createSimulatorPorts`, `createWsRealPorts`, `incident$`, `reconnect$`, `routeIdleLifecycle`, `WsAdapter`, `WsConnectionEventsAdapter`; from `@rtc/domain` — `type ConnectionEventsPort`; from `@rtc/react-bindings` — `createViewModel`, `createMachineFactories`? (NOTE: `createMachineFactories` is exported from `@rtc/client-core` — confirm via barrel), `ViewModelProvider`, `type ViewModel`; `createApp` from `@rtc/client-core`. `AsyncStoragePreferencesAdapter` from Task 3.
- Produces: `buildNativePorts(opts?: { simulator?: boolean }): AppPorts` and `AppRoot` React component.

- [ ] **Step 1: Add deps.**
```bash
cd packages/client-react-native
pnpm add @rtc/react-bindings@workspace:* @rtc/client-core@workspace:* rxjs@^7.8
```
`pnpm install`; `pnpm check:versions` (0). (`@react-rxjs/core` is a transitive dep of react-bindings — no direct add.)

- [ ] **Step 2: Write the failing composition test.** Create `buildNativePorts.test.ts` (node env) — the simulator branch must compose an `App` with no network:
```ts
import { firstValueFrom } from "rxjs";
import { expect, test } from "vitest";

import { createApp } from "@rtc/client-core";

import { buildNativePorts } from "#/app/buildNativePorts";

test("simulator branch composes an App and streams currency pairs", async () => {
  const app = createApp(buildNativePorts({ simulator: true }));
  const pairs = await firstValueFrom(app.presenters.currencyPairs.pairs$);
  expect(pairs.map((p) => p.symbol)).toContain("EURUSD");
});
```
> Confirm the presenter accessor name on `app.presenters` (read `composition.ts` — it may be `currencyPairs`/`currencyPairsPresenter`). Use the real name.

- [ ] **Step 3: Run — verify it fails.** FAIL (buildNativePorts not found).

- [ ] **Step 4: Implement `buildNativePorts`.** The analogue of `buildBrowserPorts`, MINUS the browser connectivity source, MINUS colorScheme:
```ts
import { merge, mergeMap, of, tap } from "rxjs";

import {
  type AppPorts,
  buildWsUrl,
  createSimulatorPorts,
  createWsRealPorts,
  incident$,
  reconnect$,
  routeIdleLifecycle,
  WsAdapter,
  WsConnectionEventsAdapter,
} from "@rtc/client-core";
import type { ConnectionEventsPort } from "@rtc/domain";
import Constants from "expo-constants";

import { AsyncStoragePreferencesAdapter } from "#/app/adapters/AsyncStoragePreferencesAdapter";

interface BuildNativePortsOptions {
  simulator?: boolean;
}

export function buildNativePorts(opts: BuildNativePortsOptions = {}): AppPorts {
  const extra = Constants.expoConfig?.extra ?? {};
  const url = opts.simulator ? undefined : (extra.serverUrl as string | undefined);
  const token = extra.wsToken as string | undefined;
  const preferences = new AsyncStoragePreferencesAdapter();

  if (url) {
    const ws = new WsAdapter(buildWsUrl(url, token));
    const gateway = new WsConnectionEventsAdapter(ws);
    const connectionEvents: ConnectionEventsPort = {
      events: () => {
        return merge(gateway.events(), reconnect$, incident$).pipe(
          tap((e) => {
            return routeIdleLifecycle(e, ws);
          }),
        );
      },
    };
    return { ...createWsRealPorts(ws, { preferences }), connectionEvents };
  }

  const connectionEvents: ConnectionEventsPort = {
    events: () => {
      return merge(
        reconnect$.pipe(mergeMap(() => of({ type: "gatewayConnected" as const }))),
        incident$,
      );
    },
  };
  return { ...createSimulatorPorts({ preferences }), connectionEvents };
}
```
> `colorScheme` is omitted (optional; `client-core`'s `of(false)` fallback applies). Confirm `AppPorts` allows omitting `colorScheme` (Phase 0 made it optional).

- [ ] **Step 5: Run — verify it passes.** PASS.

- [ ] **Step 6: Implement `AppRoot`.** Mirror the web `AppRoot.tsx` (lazy `useRef` so StrictMode doesn't build two apps):
```tsx
import {
  type ViewModel,
  createViewModel,
  ViewModelProvider,
} from "@rtc/react-bindings";
import { createApp, createMachineFactories } from "@rtc/client-core";
import { type ReactElement, type ReactNode, useRef, useState } from "react";

import { buildNativePorts } from "#/app/buildNativePorts";

interface AppRootProps {
  simulator: boolean;
  children: ReactNode;
}

export function AppRoot({ simulator, children }: AppRootProps): ReactElement {
  const viewModelRef = useRef<ViewModel | null>(null);
  if (viewModelRef.current === null) {
    const { presenters, commands } = createApp(buildNativePorts({ simulator }));
    viewModelRef.current = createViewModel(
      presenters,
      createMachineFactories(presenters),
      commands,
    );
  }
  return (
    <ViewModelProvider viewModel={viewModelRef.current}>
      {children}
    </ViewModelProvider>
  );
}
```
> `createMachineFactories` import source: confirm it's `@rtc/client-core` (per the API reference); if the barrel does not export it, import from wherever `composition.ts` exposes it. The `simulator` prop is fixed per mount — Task 6's toggle re-mounts `AppRoot` with a React `key` to switch branches.

- [ ] **Step 7: Full gauntlet.** Typecheck will pull `react-bindings` types; `check:deps` must stay green (RN → react-bindings/client-core/domain only). Fix biome ordering.

- [ ] **Step 8: Commit.**
```bash
git add -A packages/client-react-native
git commit -m "feat(rn): buildNativePorts (real WS + simulator) + AppRoot composition"
```

---

## Task 5 — SpotTile leaf + price formatting + RNTL tests

**Files:**
- Create: `packages/client-react-native/src/ui/formatPrice.ts` + `.test.ts`, `packages/client-react-native/src/ui/SpotTile.tsx` + `SpotTile.test.tsx`.

**Interfaces:**
- Consumes: `useViewModel` from `@rtc/react-bindings` (`usePrice(pair): Price | null`); `type CurrencyPair`, `type Price`, `PriceMovementType` from `@rtc/domain`.
- Produces: `splitPrice(value: number, ratePrecision: number, pipsPosition: number): { prefix: string; pips: string; fractional: string }`; `SpotTile({ pair }: { pair: CurrencyPair }): JSX.Element`.

- [ ] **Step 1: Failing test for `splitPrice`** (`formatPrice.test.ts`, node env), porting the web `TilePrice.splitPrice` behavior:
```ts
import { expect, test } from "vitest";

import { splitPrice } from "#/ui/formatPrice";

test("splits EURUSD 1.53816 into prefix/pips/fractional", () => {
  expect(splitPrice(1.53816, 5, 4)).toEqual({ prefix: "1.53", pips: "81", fractional: "6" });
});
test("splits USDJPY 110.253 (pipsPosition 2)", () => {
  expect(splitPrice(110.253, 3, 2)).toEqual({ prefix: "110.2", pips: "53", fractional: "" });
});
```
> Verify the exact expected substrings against the web `splitPrice` math (`fractionalDigits = ratePrecision - pipsPosition`, pip segment = the two digits ending `fractionalDigits` from the right). Correct the USDJPY case to the web function's actual output.

- [ ] **Step 2: Run — fails.** Implement `formatPrice.ts` (verbatim port of the web pure function):
```ts
interface PriceParts {
  prefix: string;
  pips: string;
  fractional: string;
}

export function splitPrice(
  value: number,
  ratePrecision: number,
  pipsPosition: number,
): PriceParts {
  const formatted = value.toFixed(ratePrecision);
  const fractionalDigits = ratePrecision - pipsPosition;
  const pipEnd = formatted.length - fractionalDigits;
  const pipStart = pipEnd - 2;
  return {
    prefix: formatted.slice(0, pipStart),
    pips: formatted.slice(pipStart, pipEnd),
    fractional: formatted.slice(pipEnd),
  };
}
```

- [ ] **Step 3: Run — passes.**

- [ ] **Step 4: Failing RNTL test for `SpotTile`** (`SpotTile.test.tsx`, RN harness from Task 2). Render `SpotTile` inside a test `ViewModelProvider` whose `usePrice` returns a fixed `Price`; assert the symbol, spread, and a movement testID. Use a minimal fake ViewModel (not the full World harness — RNTL-local):
```tsx
import { render, screen } from "@testing-library/react-native";
import { ViewModelProvider, type ViewModel } from "@rtc/react-bindings";
import { type CurrencyPair, type Price, PriceMovementType } from "@rtc/domain";
// vitest path: import { expect, test } from "vitest";  (omit on jest path)

const EURUSD: CurrencyPair = { symbol: "EURUSD", ratePrecision: 5, pipsPosition: 4, base: "EUR", terms: "USD", defaultNotional: 1_000_000 };
const price: Price = { symbol: "EURUSD", bid: 1.53812, ask: 1.53818, mid: 1.53815, valueDate: "", creationTimestamp: 0, movementType: PriceMovementType.UP, spread: "0.6" };

function fakeViewModel(p: Price | null): ViewModel {
  return { usePrice: () => p /* + throwing stubs for the rest, or a Proxy */ } as unknown as ViewModel;
}

import { SpotTile } from "#/ui/SpotTile";

test("renders symbol, spread and up-movement", () => {
  render(<ViewModelProvider viewModel={fakeViewModel(price)}><SpotTile pair={EURUSD} /></ViewModelProvider>);
  expect(screen.getByText("EURUSD")).toBeTruthy();
  expect(screen.getByText("0.6")).toBeTruthy();
  expect(screen.getByTestId("spot-tile-movement").props.children).toBe("UP");
});
test("shows loading when price is null", () => {
  render(<ViewModelProvider viewModel={fakeViewModel(null)}><SpotTile pair={EURUSD} /></ViewModelProvider>);
  expect(screen.getByText("Loading…")).toBeTruthy();
});
```
> A hand-built `fakeViewModel` only needs the hooks `SpotTile` calls; cast via `as unknown as ViewModel`. Keep the movement observable via a `testID` prop carrying `movementType` for the assertion (RN has no CSS vars, so parity is by testID/prop, per the spec).

- [ ] **Step 5: Run — fails.** Implement `SpotTile.tsx`:
```tsx
import { type CurrencyPair, PriceMovementType } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { splitPrice } from "#/ui/formatPrice";

const COLOR = {
  [PriceMovementType.UP]: "#3fb68b",
  [PriceMovementType.DOWN]: "#e05252",
  [PriceMovementType.NONE]: "#c8c8c8",
} as const;

const styles = StyleSheet.create({ /* container, symbol, row, pips, spread, loading */ });

export function SpotTile({ pair }: { pair: CurrencyPair }): JSX.Element {
  const { usePrice } = useViewModel();
  const price = usePrice(pair);
  if (!price) {
    return (
      <View style={styles.container}>
        <Text style={styles.symbol}>{pair.symbol}</Text>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    );
  }
  const ask = splitPrice(price.ask, pair.ratePrecision, pair.pipsPosition);
  return (
    <View style={styles.container}>
      <Text style={styles.symbol}>{pair.symbol}</Text>
      <View style={styles.row}>
        <Text>{ask.prefix}</Text>
        <Text style={{ color: COLOR[price.movementType] }}>{ask.pips}</Text>
        <Text>{ask.fractional}</Text>
      </View>
      <Text style={styles.spread}>{price.spread}</Text>
      <Text testID="spot-tile-movement" style={styles.hidden}>{price.movementType}</Text>
    </View>
  );
}
```
> The inline `style={{ color: ... }}` is a runtime-computed value — allowed (RN `StyleSheet` has no CSS-vars; this is not the banned DOM inline-style pattern, and this package is outside the client-react inline-style ESLint scope — verify `lint:eslint` passes; if the repo rule catches it, extract to a `StyleSheet` map keyed by movement).

- [ ] **Step 6: Run — passes.** Both RNTL tests green.

- [ ] **Step 7: Full gauntlet.** The `.test.tsx` runs under the Task 2 harness via `pnpm test`. Biome/eslint clean.

- [ ] **Step 8: Commit.**
```bash
git add -A packages/client-react-native
git commit -m "feat(rn): SpotTile leaf + price split + RNTL tests"
```

---

## Task 6 — Screen: TileGrid + ConnectionBanner + simulator toggle + export proof

**Files:**
- Create: `packages/client-react-native/src/ui/TileGrid.tsx`, `packages/client-react-native/src/ui/ConnectionBanner.tsx`.
- Modify: `packages/client-react-native/app/index.tsx`, `packages/client-react-native/app.config.ts`.

**Interfaces:**
- Consumes: `useViewModel` (`useCurrencyPairs(): readonly CurrencyPair[]`, `useConnectionStatus(): ConnectionStatus`); `ConnectionStatus` from `@rtc/domain`; `SpotTile`, `AppRoot`.

- [ ] **Step 1: `TileGrid`** — a `FlatList` of `SpotTile`s from `useCurrencyPairs()`:
```tsx
import { type CurrencyPair } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";
import type { JSX } from "react";
import { FlatList, type ListRenderItemInfo, StyleSheet } from "react-native";

import { SpotTile } from "#/ui/SpotTile";

export function TileGrid(): JSX.Element {
  const { useCurrencyPairs } = useViewModel();
  const pairs = useCurrencyPairs();
  return (
    <FlatList
      data={pairs}
      keyExtractor={(pair: CurrencyPair) => {
        return pair.symbol;
      }}
      renderItem={({ item }: ListRenderItemInfo<CurrencyPair>) => {
        return <SpotTile pair={item} />;
      }}
    />
  );
}
```

- [ ] **Step 2: `ConnectionBanner`** — from `useConnectionStatus()`, with a Reconnect button that calls the ViewModel command (confirm the command hook — likely `useReconnect()` or a `commands.reconnect` surfaced on the ViewModel; read `createViewModel` for the exact name):
```tsx
import { ConnectionStatus } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const LABEL = {
  [ConnectionStatus.CONNECTED]: "Live",
  [ConnectionStatus.CONNECTING]: "Connecting…",
  [ConnectionStatus.DISCONNECTED]: "Disconnected",
} as const;

export function ConnectionBanner(): JSX.Element {
  const vm = useViewModel();
  const status = vm.useConnectionStatus();
  return (
    <View style={styles.banner}>
      <Text>{LABEL[status]}</Text>
      {status === ConnectionStatus.DISCONNECTED ? (
        <Pressable onPress={() => { vm.reconnect(); }}>
          <Text>Reconnect</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
```
> Confirm the reconnect command's name on the ViewModel (`vm.reconnect()` vs a `useReconnect()` hook). Use the real one. `noLeakedRender`: the `? ... : null` ternary is the required form (not `&&`).

- [ ] **Step 3: Screen with the simulator toggle.** Rewrite `app/index.tsx`:
```tsx
import type { JSX } from "react";
import { useState } from "react";
import { SafeAreaView, StyleSheet, Switch, Text, View } from "react-native";

import { AppRoot } from "#/app/AppRoot";
import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { TileGrid } from "#/ui/TileGrid";

export default function IndexScreen(): JSX.Element {
  const [simulator, setSimulator] = useState(false);
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.toolbar}>
        <Text>Simulator</Text>
        <Switch value={simulator} onValueChange={setSimulator} />
      </View>
      {/* key re-mounts AppRoot when the branch changes, rebuilding the composition */}
      <AppRoot key={simulator ? "sim" : "live"} simulator={simulator}>
        <ConnectionBanner />
        <TileGrid />
      </AppRoot>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: `app.config.ts` extra.** Add the `extra` block read by `buildNativePorts`:
```ts
  extra: {
    serverUrl: process.env.EXPO_PUBLIC_SERVER_URL ?? "wss://rtc-clone-server.fly.dev",
    wsToken: process.env.EXPO_PUBLIC_WS_TOKEN,
  },
```
> Keep the deferred EAS `updates`/`projectId` placeholder comments intact. `serverUrl` defaults to the deployed Fly endpoint so the demo works with no env set; `wsToken` is undefined-safe (bare URL if unset — see `buildWsUrl`).

- [ ] **Step 5: Prove the real-stack bundle.**
```bash
pnpm build
pnpm --filter @rtc/client-react-native export
```
Expected: exit 0; Metro bundles the full composition (react-bindings + client-core real stack). Capture any unresolved-module error.

- [ ] **Step 6: Full gauntlet** (all 12). `useExplicitType` on components; knip must see `TileGrid`/`ConnectionBanner`/`AppRoot` as used (routed from `app/index.tsx`).

- [ ] **Step 7: Commit.**
```bash
git add -A packages/client-react-native
git commit -m "feat(rn): live SpotTile grid + connection banner + simulator toggle"
```

---

## Task 7 — Live-WS smoke + README + EAS handoff

**Files:**
- Create: `packages/client-react-native/scripts/liveWsSmoke.ts`.
- Modify: `packages/client-react-native/package.json` (a `smoke:ws` script), `packages/client-react-native/README.md`.

**Interfaces:**
- Consumes: `WsAdapter`, `buildWsUrl` from `@rtc/client-core`; a pricing subscription via `createWsRealPorts`.

- [ ] **Step 1: Write the smoke script** (a node/tsx script, NOT a vitest/CI test — run manually). It opens the real transport against the Fly server and asserts a price tick arrives within a timeout:
```ts
import { firstValueFrom, timeout } from "rxjs";

import { buildWsUrl, createWsRealPorts, WsAdapter } from "@rtc/client-core";
import { PreferencesSimulator } from "@rtc/domain";
import { KNOWN_CURRENCY_PAIRS } from "@rtc/domain";

async function main(): Promise<void> {
  const url = process.env.EXPO_PUBLIC_SERVER_URL ?? "wss://rtc-clone-server.fly.dev";
  const token = process.env.EXPO_PUBLIC_WS_TOKEN;
  const ws = new WsAdapter(buildWsUrl(url, token));
  const ports = createWsRealPorts(ws, { preferences: new PreferencesSimulator() });
  const first = KNOWN_CURRENCY_PAIRS[0];
  const tick = await firstValueFrom(ports.pricing.prices(first).pipe(timeout({ first: 15_000 })));
  console.log("live tick:", tick.symbol, tick.bid, tick.ask);
  ws.dispose();
}

main().then(() => process.exit(0)).catch((e) => { console.error("smoke failed:", e); process.exit(1); });
```
> Confirm the `PricingPort` method name (`prices(pair)` vs `getPrices`) from `packages/domain/src/ports`; use the real one. Node 26 has a global `WebSocket`, so `WsAdapter` runs in node unchanged.

- [ ] **Step 2: Add the script** to `package.json` (NOT wired into `test`/CI — the server scales to zero and the network would flake a gate):
```json
"smoke:ws": "tsx scripts/liveWsSmoke.ts"
```
Add `tsx` as a devDep if not present (it is, from Phase 1's toolchain? verify; `pnpm add -D tsx` if missing, normalized).

- [ ] **Step 3: Run the smoke locally** (documents the real proof — the server cold-starts):
```bash
pnpm build
EXPO_PUBLIC_WS_TOKEN=<token> pnpm --filter @rtc/client-react-native smoke:ws
```
Expected: prints a live tick (`live tick: EURUSD 1.xxxxx 1.xxxxx`) and exits 0. If the token is unavailable to the controller, note that this step is user-run and record the command; do not fail the task on a missing secret.

- [ ] **Step 4: README.** Extend `packages/client-react-native/README.md` with: how to run the app (`pnpm --filter @rtc/client-react-native start`, Expo Go), the simulator toggle, the `smoke:ws` command + the `EXPO_PUBLIC_WS_TOKEN`/`EXPO_PUBLIC_SERVER_URL` env, and the **EAS handoff** — the user runs `eas login` → `eas init` (fills `projectId`/`updates.url`, then uncomment them in `app.config.ts`) → `eas update --channel preview` → share the QR/link for Expo Go.

- [ ] **Step 5: Full gauntlet** (the script is a `.ts` under `scripts/` — ensure knip sees it via its `smoke:ws` script entry; add `scripts/liveWsSmoke.ts` to the RN workspace `knip.json` `entry` if flagged; biome-clean).

- [ ] **Step 6: Commit.**
```bash
git add -A packages/client-react-native knip.json
git commit -m "feat(rn): live-WS smoke script + README + EAS handoff docs"
```

---

## Self-Review (controller, before dispatch)

- **Spec coverage:** WsAdapter lift (T1) ✓ §1; buildNativePorts + full composition (T4) ✓ §2; AsyncStorage adapter (T3) ✓ §3; SpotTile/TileGrid/ConnectionBanner + toggle (T5, T6) ✓ §4; RNTL tests + harness (T2, T5) ✓ §5 (Decision: RNTL-local, renderer-neutral refactor deferred); live-WS smoke local-only (T7) ✓ §5.3; EAS handoff user-run (T7) ✓ §6; NetInfo deferred (not built) ✓ §Decision 3.
- **Naming to VERIFY during execution (flagged inline, not guessed):** `app.presenters.currencyPairs` accessor name; `createMachineFactories` export source; the ViewModel reconnect command name; the `PricingPort` price-stream method name; `ConnectionStatus` enum member names; `AppPorts.colorScheme` optionality; whether `MockWebSocket.testHelpers` is DOM-free. Each task step says "confirm the real name" where the API reference left a residual — the implementer reads the source, does not invent.
- **#1 risk front-loaded:** Task 2 is the RNTL-harness spike with a documented vitest-first / jest-expo-fallback fork — fail-fast before leaves depend on it.
- **Placeholder scan:** the only intentional deferrals are EAS `projectId`/`updates.url` (user-run) and the harness path (spike-decided, both configs given). No `TODO`/`TBD` logic gaps.
- **Behavior-preservation:** T1 moves `WsAdapter` verbatim (only import path changes); netted by the existing WS suite.
```
