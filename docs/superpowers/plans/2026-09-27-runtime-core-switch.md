# Runtime Application-Core Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any visitor of the deployed web clients switch between the RxJS, async and Effect application cores at load time (`?core=` or Preferences → save + reload), with the async and Effect cores shipped as lazy chunks.

**Architecture:** A per-client `src/app/coreSelection.ts` resolves the choice before boot (URL → stored → build default → rxjs), `main.tsx` awaits `loadCore()` (static `rxjsCore`, dynamic `import()` for the other two) and hands the core to `AppRoot`. The choice reaches the dumb UI as an optional app-shell value on the ViewModel (`useCoreSelection()`), never through a core. `check:core-bundle` switches from one build per core to one build per client with per-chunk assertions, and `deploy.yml`'s production guard reuses it.

**Tech Stack:** TypeScript, Vite (rolldown) dynamic `import()`, React 19 / SolidJS, `@rtc/react-bindings` / `@rtc/solid-bindings`, vitest, `@rtc/ui-contract`, Playwright.

**Spec:** [docs/superpowers/specs/2026-09-27-runtime-core-switch-design.md](../specs/2026-09-27-runtime-core-switch-design.md)

## Global Constraints

- RxJS stays the default and stays in the entry bundle; async and Effect are lazy chunks (approach A). Approach B and hot swap are out of scope.
- Precedence: `?core=` (this load only, never stored) → `localStorage["rtc.coreImpl"]` → build default `VITE_CORE_IMPL` → `"rxjs"`.
- Unknown `?core=` → ignored + `console.warn`; unknown stored value → removed + `console.warn`; unknown build default → throw `VITE_CORE_IMPL="<x>" is not one of rxjs, async, effect`.
- Selecting a core: store it, then reload **with `?core=` removed**. Selecting the current core is a no-op.
- A rejected core chunk never silently falls back to RxJS: show a boot error with a "Load the default core" action (clears the stored choice, reloads without `?core=`).
- `<html data-core-impl>` = the impl that actually loaded.
- React Native unchanged (the bindings' new parameter is optional; RN passes nothing and renders no row).
- `src/ui` stays dumb: no `localStorage`, no `location`, no `import.meta.env` there (grep gates 27/28/35/36).
- Every new test is mutation-checked (`pnpm mutation-check <spec.json>`); gate the FINAL tree (biome format → eslint --fix → read-only gates).
- Worktree: `.claude/worktrees/runtime-core-switch` (branch `worktree-runtime-core-switch`); never edit the primary checkout.

## Review Focus

1. **A reload loop / stale `?core=`:** a page opened as `?core=effect` whose visitor picks async must land on async (the URL param must be stripped on select) — pinned by Task 3's `reloadWithoutCoreParam` test and Task 7's e2e.
2. **Storage unavailable** (private mode, blocked storage throws on access): the app must still boot on the default core, and selecting must still reload onto the chosen core for that load — pinned by Task 3 tests (`readStoredChoice`/`saveCoreChoice` swallow and warn; select falls back to `?core=` navigation when saving fails).
3. **Chunk load failure** (offline, stale deploy after a new release changed chunk hashes): boot error with a working reset, no silent RxJS — pinned by Task 4's `bootApp` test with a rejecting loader.
4. **Deploy guard regression:** production output must pass the rewritten guard while still failing if an alternative core leaks into the eager graph — pinned by Task 6's negative proof.
5. **StrictMode double render** must not create a second App now that the core arrives as a prop — pinned by Task 4 keeping the lazy ref and its existing test.

---

### Task 1: Core-selection types and a real Effect brand

**Files:**
- Modify: `packages/core-api/src/app.ts` (next to `CoreFactory`, ~line 401)
- Modify: `packages/client-core-effect/src/composition.ts` (brand, mirroring `ASYNC_CORE_BRAND` in `packages/client-core-async/src/composition.ts:380`)
- Modify: `packages/client-core-effect/src/index.ts` (export the constant)
- Test: `packages/client-core-effect/src/composition.brand.test.ts`

**Interfaces:**
- Produces (core-api, types only):
```ts
export type CoreImpl = "rxjs" | "async" | "effect";

export interface CoreOption {
  readonly impl: CoreImpl;
  readonly label: string;
  readonly description: string;
}

/** App-shell value: which application core this page booted, and how to
 * switch. Not served by a core — the choice is made before any core exists. */
export interface CoreSelection {
  readonly current: CoreImpl;
  readonly options: readonly CoreOption[];
  select(impl: CoreImpl): void;
}
```
- Produces (effect core): `export const EFFECT_CORE_BRAND = "@rtc/client-core-effect:brand";` carried by `effectCore` exactly as `asyncCore` carries `ASYNC_CORE_BRAND` (read how `BrandedCoreFactory` is declared/stamped in the async core and mirror it).

- [ ] **Step 1: Write the failing test** — `composition.brand.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { EFFECT_CORE_BRAND, effectCore } from "#/index";

describe("effectCore brand", () => {
  it("carries the Effect core brand", () => {
    expect((effectCore as { brand?: string }).brand).toBe(EFFECT_CORE_BRAND);
    expect(EFFECT_CORE_BRAND).toBe("@rtc/client-core-effect:brand");
  });
});
```
- [ ] **Step 2: Run** `pnpm --filter @rtc/client-core-effect test composition.brand` — Expected: FAIL (`EFFECT_CORE_BRAND` not exported).
- [ ] **Step 3: Implement** the constant + stamp (mirror async), export it, add the core-api types (export from `packages/core-api/src/index.ts` if it re-exports `app.ts` selectively).
- [ ] **Step 4: Run** the test + `pnpm --filter @rtc/core-api --filter @rtc/client-core-effect build` + `pnpm typecheck` — Expected: PASS / exit 0. Update `packages/client-core-effect` public-API snapshot if one exists (`git grep -l publicApi packages/client-core-effect`).
- [ ] **Step 5: Mutation-check** (`brand` value changed; stamp removed) — both KILLED.
- [ ] **Step 6: Commit** `feat(core): CoreSelection types in core-api; a real Effect core brand`.

---

### Task 2: Bindings expose `useCoreSelection()`

**Files:**
- Modify: `packages/react-bindings/src/createViewModel.ts` (`ViewModel` interface ~line 334; `createViewModel` ~line 574)
- Modify: `packages/solid-bindings/src/createViewModel.ts` (parallel)
- Test: `packages/react-bindings/src/createViewModel.coreSelection.test.ts`, `packages/solid-bindings/src/createViewModel.coreSelection.test.ts`

**Interfaces:**
- Consumes: `CoreSelection` from `@rtc/core-api` (Task 1).
- Produces: `createViewModel(presenters, machines, commands, shell?: ViewModelShell)` where
```ts
export interface ViewModelShell {
  readonly coreSelection?: CoreSelection;
}
```
and `ViewModel.useCoreSelection: () => CoreSelection | null` (null when the host supplied none — RN, older callers).

- [ ] **Step 1: Failing test (react)** — reuse the existing createViewModel test fixture helper in that package (look for how other `createViewModel.*.test.ts` build presenters/machines/commands; use the same `create*` helper):
```ts
it("exposes the host's core selection", () => {
  const selection: CoreSelection = {
    current: "async",
    options: [{ impl: "async", label: "async/await", description: "d" }],
    select: vi.fn(),
  };
  const vm = createViewModel(presenters, machines, commands, { coreSelection: selection });
  expect(vm.useCoreSelection()).toBe(selection);
});

it("reports no core selection when the host supplies none", () => {
  const vm = createViewModel(presenters, machines, commands);
  expect(vm.useCoreSelection()).toBeNull();
});
```
(`useCoreSelection` returns a constant, so calling it outside a component is fine — it must not use React/Solid hooks internally.)
- [ ] **Step 2: Run** `pnpm --filter @rtc/react-bindings test coreSelection` — FAIL.
- [ ] **Step 3: Implement** in react-bindings:
```ts
// in createViewModel, after the existing hooks are built
const coreSelection = shell?.coreSelection ?? null;
// in the returned object
useCoreSelection: () => {
  return coreSelection;
},
```
plus the `ViewModel` member doc: `/** The app-shell core switch (web only); null when the host offers none. */`.
- [ ] **Step 4:** Same test + implementation in solid-bindings.
- [ ] **Step 5: Run** both packages' tests + `pnpm typecheck` (every object literal typed `ViewModel` — the ui-contract fixtures — now fails to typecheck until Task 5 adds `useCoreSelection`; add `useCoreSelection: () => null` to both `viewModelFromWorld.ts` NOW so the tree stays green, Task 5 replaces it).
- [ ] **Step 6: Mutation-check** (return `null` always; ignore `shell`) — KILLED in both.
- [ ] **Step 7: Commit** `feat(bindings): optional app-shell core selection on the ViewModel`.

---

### Task 3: `coreSelection.ts` in both web clients (pure logic + storage + navigation)

**Files:**
- Create: `packages/client-react/src/app/coreSelection.ts`, `packages/client-solid/src/app/coreSelection.ts` (byte-identical — the two `selectCore.ts` already are)
- Test: `packages/client-{react,solid}/src/app/coreSelection.test.ts`
- Delete (in Task 4, once nothing imports it): `src/app/selectCore.ts` + `selectCore.test.ts`

**Interfaces:**
- Consumes: `CoreImpl`, `CoreOption`, `CoreSelection`, `CoreFactory` from `@rtc/core-api`.
- Produces:
```ts
export const CORE_IMPLS: readonly CoreImpl[];
export const CORE_OPTIONS: readonly CoreOption[];
export const CORE_CHOICE_KEY = "rtc.coreImpl";
export const CORE_PARAM = "core";

export interface CoreChoiceInputs {
  readonly url: string | null;       // ?core= value, null if absent
  readonly stored: string | null;    // localStorage value, null if absent/unreadable
  readonly buildDefault: string | undefined; // import.meta.env.VITE_CORE_IMPL
}
export interface CoreChoice {
  readonly impl: CoreImpl;
  readonly warnings: readonly string[];
  readonly clearStored: boolean;
}
export function resolveCoreChoice(inputs: CoreChoiceInputs): CoreChoice;
export function loadCore(impl: CoreImpl): Promise<CoreFactory>;
export function readStoredChoice(storage: Pick<Storage, "getItem"> | undefined): string | null;
export function saveCoreChoice(storage: Pick<Storage, "setItem"> | undefined, impl: CoreImpl): boolean;
export function clearCoreChoice(storage: Pick<Storage, "removeItem"> | undefined): void;
export function urlWithoutCoreParam(href: string): string;
export function createCoreSelection(deps: {
  current: CoreImpl;
  storage: Storage | undefined;
  href: () => string;
  navigate: (href: string) => void;
}): CoreSelection;
```

- [ ] **Step 1: Failing tests** (`coreSelection.test.ts`, identical in both clients):
```ts
import { describe, expect, it, vi } from "vitest";

import {
  CORE_CHOICE_KEY,
  createCoreSelection,
  loadCore,
  readStoredChoice,
  resolveCoreChoice,
  saveCoreChoice,
  urlWithoutCoreParam,
} from "./coreSelection";

describe("resolveCoreChoice", () => {
  it("defaults to rxjs", () => {
    expect(resolveCoreChoice({ url: null, stored: null, buildDefault: undefined }).impl).toBe("rxjs");
  });
  it("prefers the build default over nothing", () => {
    expect(resolveCoreChoice({ url: null, stored: null, buildDefault: "async" }).impl).toBe("async");
  });
  it("prefers the stored choice over the build default", () => {
    expect(resolveCoreChoice({ url: null, stored: "effect", buildDefault: "async" }).impl).toBe("effect");
  });
  it("prefers the URL over the stored choice", () => {
    expect(resolveCoreChoice({ url: "async", stored: "effect", buildDefault: "rxjs" }).impl).toBe("async");
  });
  it("ignores an unknown URL value with a warning", () => {
    const choice = resolveCoreChoice({ url: "efect", stored: "effect", buildDefault: undefined });
    expect(choice.impl).toBe("effect");
    expect(choice.warnings).toEqual([expect.stringContaining('?core="efect"')]);
    expect(choice.clearStored).toBe(false);
  });
  it("clears an unknown stored value with a warning", () => {
    const choice = resolveCoreChoice({ url: null, stored: "gone", buildDefault: undefined });
    expect(choice.impl).toBe("rxjs");
    expect(choice.clearStored).toBe(true);
    expect(choice.warnings).toEqual([expect.stringContaining('"gone"')]);
  });
  it("treats an empty build default as unset", () => {
    expect(resolveCoreChoice({ url: null, stored: null, buildDefault: "" }).impl).toBe("rxjs");
  });
  it("fails closed on an unknown build default", () => {
    expect(() => {
      return resolveCoreChoice({ url: null, stored: null, buildDefault: "efect" });
    }).toThrow('VITE_CORE_IMPL="efect" is not one of rxjs, async, effect');
  });
});

describe("loadCore", () => {
  it.each(["rxjs", "async", "effect"] as const)("loads the %s core", async (impl) => {
    const core = await loadCore(impl);
    expect(typeof core.createApp).toBe("function");
    expect(typeof core.createMachineFactories).toBe("function");
  });
  it("loads distinct factories per core", async () => {
    const [a, b, c] = await Promise.all([loadCore("rxjs"), loadCore("async"), loadCore("effect")]);
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe("storage", () => {
  it("reads nothing when storage throws", () => {
    const storage = { getItem: () => { throw new Error("denied"); } };
    expect(readStoredChoice(storage)).toBeNull();
  });
  it("reports a failed save instead of throwing", () => {
    const storage = { setItem: () => { throw new Error("quota"); } };
    expect(saveCoreChoice(storage, "async")).toBe(false);
  });
  it("saves under the choice key", () => {
    const setItem = vi.fn();
    expect(saveCoreChoice({ setItem }, "effect")).toBe(true);
    expect(setItem).toHaveBeenCalledWith(CORE_CHOICE_KEY, "effect");
  });
});

describe("urlWithoutCoreParam", () => {
  it("drops only the core parameter", () => {
    expect(urlWithoutCoreParam("https://x.test/app?core=effect&a=1#h")).toBe("https://x.test/app?a=1#h");
  });
  it("leaves a URL without the parameter unchanged", () => {
    expect(urlWithoutCoreParam("https://x.test/app")).toBe("https://x.test/app");
  });
});

describe("createCoreSelection", () => {
  function createDeps(saveWorks = true) {
    const setItem = vi.fn(() => { if (!saveWorks) { throw new Error("denied"); } });
    const navigate = vi.fn();
    return { setItem, navigate, deps: {
      current: "rxjs" as const,
      storage: { setItem, getItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(), key: vi.fn(), length: 0 } as unknown as Storage,
      href: () => "https://x.test/?core=effect&a=1",
      navigate,
    } };
  }
  it("saves and reloads without ?core= onto the chosen core", () => {
    const { setItem, navigate, deps } = createDeps();
    createCoreSelection(deps).select("async");
    expect(setItem).toHaveBeenCalledWith(CORE_CHOICE_KEY, "async");
    expect(navigate).toHaveBeenCalledWith("https://x.test/?a=1");
  });
  it("falls back to ?core= navigation when the choice cannot be saved", () => {
    const { navigate, deps } = createDeps(false);
    createCoreSelection(deps).select("async");
    expect(navigate).toHaveBeenCalledWith("https://x.test/?a=1&core=async");
  });
  it("does nothing when the current core is selected", () => {
    const { setItem, navigate, deps } = createDeps();
    createCoreSelection(deps).select("rxjs");
    expect(setItem).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
  it("offers all three cores", () => {
    expect(createCoreSelection(createDeps().deps).options.map((o) => o.impl)).toEqual(["rxjs", "async", "effect"]);
  });
});
```
- [ ] **Step 2: Run** `pnpm --filter @rtc/client-react test coreSelection` — FAIL (module missing).
- [ ] **Step 3: Implement** `coreSelection.ts`:
```ts
import { rxjsCore } from "@rtc/client-core";
import type { CoreFactory, CoreImpl, CoreOption, CoreSelection } from "@rtc/core-api";

export const CORE_IMPLS: readonly CoreImpl[] = ["rxjs", "async", "effect"];
export const CORE_CHOICE_KEY = "rtc.coreImpl";
export const CORE_PARAM = "core";

export const CORE_OPTIONS: readonly CoreOption[] = [
  { impl: "rxjs", label: "RxJS", description: "Observables and operators — the default core." },
  { impl: "async", label: "async/await", description: "Plain async/await and AsyncIterable, no stream library." },
  { impl: "effect", label: "Effect-TS", description: "Effect's fibers, layers and streams." },
];

// … CoreChoiceInputs / CoreChoice interfaces as in Interfaces …

export function resolveCoreChoice(inputs: CoreChoiceInputs): CoreChoice {
  const warnings: string[] = [];
  let clearStored = false;

  if (inputs.url !== null) {
    if (isCoreImpl(inputs.url)) {
      return { impl: inputs.url, warnings, clearStored };
    }
    warnings.push(`?core="${inputs.url}" is not one of ${CORE_IMPLS.join(", ")} — ignored`);
  }

  if (inputs.stored !== null) {
    if (isCoreImpl(inputs.stored)) {
      return { impl: inputs.stored, warnings, clearStored };
    }
    warnings.push(`stored core "${inputs.stored}" is not one of ${CORE_IMPLS.join(", ")} — cleared`);
    clearStored = true;
  }

  const build = inputs.buildDefault || undefined;
  if (build === undefined) {
    return { impl: "rxjs", warnings, clearStored };
  }
  if (!isCoreImpl(build)) {
    throw new Error(`VITE_CORE_IMPL="${build}" is not one of ${CORE_IMPLS.join(", ")}`);
  }
  return { impl: build, warnings, clearStored };
}

/** RxJS is statically imported (its adapters are in the entry bundle anyway);
 * the other two are split into their own chunks by the dynamic import. */
export async function loadCore(impl: CoreImpl): Promise<CoreFactory> {
  if (impl === "async") {
    return (await import("@rtc/client-core-async")).asyncCore;
  }
  if (impl === "effect") {
    return (await import("@rtc/client-core-effect")).effectCore;
  }
  return rxjsCore;
}

export function readStoredChoice(storage: Pick<Storage, "getItem"> | undefined): string | null {
  try {
    return storage?.getItem(CORE_CHOICE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveCoreChoice(storage: Pick<Storage, "setItem"> | undefined, impl: CoreImpl): boolean {
  try {
    if (storage === undefined) {
      return false;
    }
    storage.setItem(CORE_CHOICE_KEY, impl);
    return true;
  } catch {
    return false;
  }
}

export function clearCoreChoice(storage: Pick<Storage, "removeItem"> | undefined): void {
  try {
    storage?.removeItem(CORE_CHOICE_KEY);
  } catch {
    // Unreadable storage holds nothing to clear.
  }
}

export function urlWithoutCoreParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(CORE_PARAM);
  return url.toString();
}

export function createCoreSelection(deps: {
  current: CoreImpl;
  storage: Storage | undefined;
  href: () => string;
  navigate: (href: string) => void;
}): CoreSelection {
  return {
    current: deps.current,
    options: CORE_OPTIONS,
    select: (impl) => {
      if (impl === deps.current) {
        return;
      }
      const clean = urlWithoutCoreParam(deps.href());
      if (saveCoreChoice(deps.storage, impl)) {
        deps.navigate(clean);
        return;
      }
      // Storage unavailable: carry the choice for this load in the URL instead.
      const url = new URL(clean);
      url.searchParams.set(CORE_PARAM, impl);
      deps.navigate(url.toString());
    },
  };
}

function isCoreImpl(value: string): value is CoreImpl {
  return (CORE_IMPLS as readonly string[]).includes(value);
}
```
Note: `urlWithoutCoreParam("https://x.test/app")` must return the input unchanged — `new URL(...).toString()` keeps it; if a trailing-`?` or slash normalisation difference shows, return `href` untouched when the param is absent.
- [ ] **Step 4: Run** tests (both clients) — PASS.
- [ ] **Step 5: Mutation-check** each: swap URL/stored precedence; drop `clearStored = true`; drop the build-default throw; `loadCore("async")` returns rxjsCore; `urlWithoutCoreParam` keeps the param; `select` skips the save; `select` no-op guard removed; storage-failure fallback removed; `readStoredChoice` rethrows. All KILLED.
- [ ] **Step 6: Commit** `feat(clients): coreSelection — resolve, load, persist and switch the application core`.

---

### Task 4: Boot wiring — `main.tsx` / `AppRoot` take the core; boot error

**Files:**
- Create: `packages/client-{react,solid}/src/app/bootApp.ts` (framework-free boot orchestration, identical in both)
- Test: `packages/client-{react,solid}/src/app/bootApp.test.ts`
- Modify: `packages/client-react/src/main.tsx`, `packages/client-react/src/AppRoot.tsx` (+ its test if one constructs AppRoot)
- Modify: `packages/client-solid/src/main.tsx` (or the entry the facts name), `packages/client-solid/src/AppRoot.tsx`
- Delete: `packages/client-{react,solid}/src/app/selectCore.ts` and `selectCore.test.ts`

**Interfaces:**
- Consumes: Task 3's exports; Task 2's `createViewModel(..., { coreSelection })`.
- Produces:
```ts
export interface BootEnv {
  readonly href: string;
  readonly storage: Storage | undefined;
  readonly buildDefault: string | undefined;
  readonly warn: (message: string) => void;
  readonly load: (impl: CoreImpl) => Promise<CoreFactory>;
}
export interface BootResult {
  readonly impl: CoreImpl;
  readonly core: CoreFactory;
}
/** Resolve, clear a bad stored value, load. Rejects if the chunk fails. */
export function bootCore(env: BootEnv): Promise<BootResult>;
/** Plain-DOM boot failure: message + a button that clears the choice and reloads onto the default. */
export function renderBootError(root: HTMLElement, error: unknown, reset: () => void): void;
```
- `AppRoot` props: React `{ core: CoreFactory; coreSelection: CoreSelection; children }`; Solid `ParentProps<{ core: CoreFactory; coreSelection: CoreSelection }>`.

- [ ] **Step 1: Failing tests** (`bootApp.test.ts`, jsdom):
```ts
it("boots the URL's core and publishes nothing itself", async () => {
  const load = vi.fn(async () => { return createFakeCore(); });
  const result = await bootCore(createEnv({ href: "https://x.test/?core=effect", load }));
  expect(result.impl).toBe("effect");
  expect(load).toHaveBeenCalledWith("effect");
});
it("clears an unknown stored choice and warns", async () => {
  const storage = createMemoryStorage({ "rtc.coreImpl": "gone" });
  const warn = vi.fn();
  const result = await bootCore(createEnv({ storage, warn }));
  expect(result.impl).toBe("rxjs");
  expect(storage.getItem("rtc.coreImpl")).toBeNull();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('"gone"'));
});
it("rejects when the core chunk fails to load (no silent fallback)", async () => {
  const load = vi.fn(async () => { throw new Error("chunk 404"); });
  await expect(bootCore(createEnv({ href: "https://x.test/?core=async", load }))).rejects.toThrow("chunk 404");
  expect(load).toHaveBeenCalledTimes(1);
});
it("renders a boot error whose action resets to the default core", async () => {
  const root = document.createElement("div");
  const reset = vi.fn();
  renderBootError(root, new Error("chunk 404"), reset);
  expect(root.textContent).toContain("chunk 404");
  root.querySelector("button")?.click();
  expect(reset).toHaveBeenCalledTimes(1);
});
```
(`createEnv`, `createFakeCore`, `createMemoryStorage` are `create*` factories declared below the cases.)
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `bootApp.ts`:
```ts
export async function bootCore(env: BootEnv): Promise<BootResult> {
  const url = new URL(env.href).searchParams.get(CORE_PARAM);
  const choice = resolveCoreChoice({
    url,
    stored: readStoredChoice(env.storage),
    buildDefault: env.buildDefault,
  });
  for (const warning of choice.warnings) {
    env.warn(warning);
  }
  if (choice.clearStored) {
    clearCoreChoice(env.storage);
  }
  return { impl: choice.impl, core: await env.load(choice.impl) };
}

export function renderBootError(root: HTMLElement, error: unknown, reset: () => void): void {
  const message = document.createElement("p");
  message.textContent = `The application core failed to load: ${error instanceof Error ? error.message : String(error)}`;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Load the default core";
  button.dataset.testid = "boot-core-reset";
  button.addEventListener("click", reset);
  root.replaceChildren(message, button);
}
```
Storage access for `bootCore` in `main.tsx` is `safeLocalStorage()` = `try { return window.localStorage } catch { return undefined }` (put it in `coreSelection.ts`, exported, with a one-line test).
- [ ] **Step 4: Wire React** `main.tsx`:
```tsx
const storage = safeLocalStorage();

bootCore({
  href: location.href,
  storage,
  buildDefault: import.meta.env.VITE_CORE_IMPL,
  warn: (m) => { console.warn(`[core] ${m}`); },
  load: loadCore,
}).then(
  ({ impl, core }) => {
    document.documentElement.dataset.coreImpl = impl;
    const coreSelection = createCoreSelection({
      current: impl,
      storage,
      href: () => location.href,
      navigate: (href) => { location.assign(href); },
    });
    createRoot(rootEl).render(
      <StrictMode>
        <AppRoot core={core} coreSelection={coreSelection}>
          <App />
        </AppRoot>
      </StrictMode>,
    );
  },
  (error: unknown) => {
    renderBootError(rootEl, error, () => {
      clearCoreChoice(storage);
      location.assign(urlWithoutCoreParam(location.href));
    });
  },
);
```
`AppRoot`: replace `activeCore` with `props.core`, and pass `{ coreSelection }` as `createViewModel`'s 4th argument. Keep the lazy ref unchanged. Note `location.assign(sameUrlWithoutParam)` on an unchanged URL is a navigation (reload) in all browsers — verify in the Task 7 e2e; if a same-URL assign does not reload in Chromium, use `location.replace(href)` + `location.reload()` when `href === location.href`.
- [ ] **Step 5: Wire Solid** identically (`render(() => <AppRoot core={core} coreSelection={coreSelection}><App /></AppRoot>, rootEl)`), `props.core` in `AppRoot`.
- [ ] **Step 6:** Delete `selectCore.ts` / `selectCore.test.ts` in both clients; update comment references (`packages/core-api/src/app.ts:401`, `packages/client-core/src/composition.ts:1079`, `tests/browser/page-objects/**/LoginScreen.ts`, `tests/browser/scenarios/login.ts`, both `vite.config.ts` `define` comments, `ci.yml` comments) to name `coreSelection.ts` / `bootApp.ts`. `login.ts`'s `expectSelectedCoreImpl` also matches page errors containing `VITE_CORE_IMPL` — still true (the build-default throw keeps that text).
- [ ] **Step 7: Run** `pnpm typecheck`, both clients' `test`, `test:ui:contract`, and `pnpm --filter @rtc/tests test:report`; start `pnpm dev:react:async` and confirm by `curl -s localhost:5173 >/dev/null` + one Playwright smoke (Task 7 covers it properly) — at minimum confirm the build: `pnpm --filter @rtc/client-react build` exit 0.
- [ ] **Step 8: Mutation-check** bootApp: skip `clearCoreChoice`; swallow the load rejection and return rxjs; drop warnings. KILLED.
- [ ] **Step 9: Commit** `feat(clients): boot the chosen core — lazy alt-core chunks, boot error, no selectCore`.

---

### Task 5: Preferences "Application core" row (both clients) + ui-contract

**Files:**
- Modify: `packages/client-{react,solid}/src/ui/shell/prefs/PreferencesContent.tsx` (add a `PrefSegment` row next to "Layout engine", ~line 247 react)
- Modify: `packages/ui-contract/src/shared/harness/world.ts` (`World.coreSelection`, `CommandLog.coreSelects`, `createWorld({ coreImplSeed })`)
- Modify: `packages/client-{react,solid}/tests/ui/contract/*/viewModelFromWorld.ts` (`useCoreSelection`)
- Modify: the ui-contract `PreferencesModal` page object (find via `@ui-contract/components` → `PreferencesModal`) — add `coreImplSelected()`, `selectCoreImpl(impl)`, `coreImplSelects()`
- Test: `packages/ui-contract/src/specs/shell/prefs/PreferencesModal.contract.spec.ts` (new cases)
- Modify: `tests/browser/page-objects/testids.ts` (or wherever `TESTIDS.prefs` lives) — `coreImplSegment: (impl) => \`pref-segment-coreImpl-${impl}\``

**Interfaces:**
- Consumes: `ViewModel.useCoreSelection(): CoreSelection | null` (Task 2).
- Produces: testids `pref-segment-coreImpl` (row) and `pref-segment-coreImpl-{rxjs,async,effect}`.

- [ ] **Step 1: Failing contract specs** (shared, run in both clients):
```ts
it("offers the three application cores with the current one selected", () => {
  const page = mount(PreferencesModal, { props: { open: true, onClose: () => {} }, coreImpl: "async" });
  expect(page.coreImplOptions()).toEqual(["rxjs", "async", "effect"]);
  expect(page.coreImplSelected()).toBe("async");
});

it("selecting another core asks the shell to switch", async () => {
  const page = mount(PreferencesModal, { props: { open: true, onClose: () => {} }, coreImpl: "rxjs" });
  await page.selectCoreImpl("effect");
  expect(page.coreImplSelects()).toEqual(["effect"]);
});

it("selecting the current core does not switch", async () => {
  const page = mount(PreferencesModal, { props: { open: true, onClose: () => {} }, coreImpl: "rxjs" });
  await page.selectCoreImpl("rxjs");
  expect(page.coreImplSelects()).toEqual([]);
});
```
- [ ] **Step 2: Run** `pnpm --filter @rtc/client-react test:ui:contract PreferencesModal` — FAIL.
- [ ] **Step 3: World + fixtures:** `World.coreImpl: BehaviorSubject<CoreImpl>` seeded from `coreImplSeed ?? "rxjs"`; `CommandLog.coreSelects: CoreImpl[]`; both `viewModelFromWorld.ts`:
```ts
useCoreSelection: () => {
  return {
    current: world.coreImpl.getValue(),
    options: CORE_OPTIONS_FOR_TESTS,
    select: (impl: CoreImpl) => {
      if (impl !== world.coreImpl.getValue()) {
        world.commands.coreSelects.push(impl);
      }
    },
  };
},
```
(`CORE_OPTIONS_FOR_TESTS` lives in `world.ts`, same three impls/labels as `CORE_OPTIONS` — the fixture cannot import a client's `src/app`.) Note the fake mirrors the real no-op rule so the spec pins the UI, and the real rule is pinned by Task 3.
- [ ] **Step 4: UI row** (react; solid identical in its idiom):
```tsx
const coreSelection = useCoreSelection();
// …
{coreSelection !== null ? (
  <PrefSegment
    label="Application core"
    description="Which core runs the app: RxJS, async/await, or Effect-TS. Switching reloads the page."
    options={coreSelection.options.map((option) => {
      return { value: option.impl, label: option.label };
    })}
    value={coreSelection.current}
    onChange={(value) => { coreSelection.select(value as CoreImpl); }}
    testid="pref-segment-coreImpl"
  />
) : null}
```
(name the `onChange` handler per `rtc/name-functions-by-effect` if the lint asks: e.g. `const switchCore = …`). If `PrefSegment` lacks per-option descriptions, the row description carries them; do not extend `PrefSegment` unless needed.
- [ ] **Step 5: Run** both clients' `test:ui:contract` and `test:ui:contract:coverage` — PASS, ≥95%.
- [ ] **Step 6: Mutation-check** (row's `onChange` ignores the value; row selected state from the first option; fixture no-op guard removed) — KILLED.
- [ ] **Step 7: Commit** `feat(ui): Preferences "Application core" row (react + solid) + contract specs`.

---

### Task 6: `check:core-bundle` per chunk; production guard reuses it

**Files:**
- Modify: `scripts/check-core-bundle.mjs` (rewrite core logic; keep the file)
- Create: `scripts/check-core-bundle.test.mjs` if the repo tests root scripts that way — else put pure helpers in `scripts/lib/coreBundle.mjs` with `scripts/lib/coreBundle.test.mjs` (check how `pnpm test:rules` / `check:scripts` treat root `scripts/*.test.mjs`; follow the existing convention — `git ls-files 'scripts/**/*.test.*'`)
- Modify: `.github/workflows/deploy.yml` (both "Guard — production ships the RxJS core only" steps, ~185 and ~283)
- Modify: `.github/workflows/ci.yml:207` step name → `Core bundle isolation (alternative cores only in their own lazy chunks)`
- Modify: `.claude/commands/rtc/gauntlet.md` (comment on the `check:core-bundle` line), `CLAUDE.md` (`check:core-bundle` Build Commands line)

**Interfaces:**
- Produces: `node scripts/check-core-bundle.mjs` (builds each client once, default core) and `node scripts/check-core-bundle.mjs --dir <static-output-dir>` (verify an existing build — used by deploy.yml).
- Pure helper:
```js
/** eagerFiles(html): the entry scripts + modulepreload hrefs one HTML page loads up front. */
export function eagerFiles(html) { /* regex over <script type="module" … src="…"> and <link rel="modulepreload" href="…"> */ }
/** classify({ files: Map<path, text>, eager: Set<path> }) → { failures: string[], sizes: {rxjs, async, effect} } */
export function classify(input) { /* rules below */ }
```
Rules in `classify` (markers: rxjs `@rtc/client-core:brand`, async `@rtc/client-core-async:brand`, effect `@rtc/client-core-effect:brand`):
  1. the eager set contains the rxjs marker, and neither alternative marker;
  2. exactly one non-eager JS file contains the async marker, exactly one the effect marker;
  3. no file contains two different core markers.

- [ ] **Step 1: Failing unit tests** for `eagerFiles` (a sample `index.html` with one module script + two modulepreloads → three paths) and `classify` (a passing layout; async marker in an eager file → failure; effect marker in two lazy files → failure; a file with both async and effect markers → failure; rxjs marker missing from eager → failure).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** helpers; rewrite the script's main: for each client, one `vite build` with `VITE_CORE_IMPL` unset into a temp dir, read `index.html` + `popout.html` (union of eager sets), read every `.js` under `assets/`, `classify`, print per-core gzip sizes, exit 1 on any failure. `--dir <dir>`: skip the build, run the same check on `<dir>` (find the client's `index.html`/`popout.html` there).
- [ ] **Step 4: Run** `pnpm build && pnpm check:core-bundle` — PASS; then the **negative proof**: temporarily add `import "@rtc/client-core-async";` to `packages/client-react/src/main.tsx`, re-run → FAIL naming the eager file; revert (`git diff --quiet packages/client-react/src/main.tsx` afterwards).
- [ ] **Step 5: deploy.yml** — replace each guard's greps with:
```yaml
      - name: Guard — alternative cores ship only as lazy chunks
        run: node scripts/check-core-bundle.mjs --dir .vercel/output/static
```
(confirm the job has the repo checked out and Node available before that step; if the output dir holds both clients, pass each client's subdir, following the paths the old grep used). zizmor/actionlint must stay clean.
- [ ] **Step 6: Mutation-check** the helpers (rule 1 skipped; "exactly one" relaxed to "at least one"; eager set ignores modulepreload) — KILLED.
- [ ] **Step 7: Commit** `ci(core-bundle): per-chunk isolation — alternative cores only as lazy chunks; deploy guard reuses it`.

---

### Task 7: e2e journey (Playwright)

**Files:**
- Modify: `tests/browser/page-objects/contracts/Preferences.ts` (`selectCoreImpl(value: "rxjs" | "async" | "effect"): Promise<void>`), `tests/browser/page-objects/playwright/Preferences.ts`
- Create: `tests/browser/scenarios/coreSwitch.ts`, `tests/browser/playwright/coreSwitch.spec.ts`

**Interfaces:**
- Consumes: testids from Task 5; `login(ctx).waitCoreImpl(expected, timeoutMs)`; the existing sign-in scenario helper used by other specs.

- [ ] **Step 1: Write the scenario** (follows `tests/browser/scenarios/layout.ts`'s style):
```ts
export async function coreSwitchRoundTrip(ctx: TestContext): Promise<void> {
  await ctx.page.goto(`${ctx.baseURL}/?core=effect`);
  await login(ctx).waitCoreImpl("effect", 10_000);
  await signIn(ctx); // the existing demo sign-in helper
  await ctx.po.preferences.open();
  await ctx.po.preferences.waitModalVisible(3_000);
  await ctx.po.preferences.selectCoreImpl("async");
  await ctx.page.waitForURL((url) => { return !url.searchParams.has("core"); });
  await login(ctx).waitCoreImpl("async", 10_000);
  await ctx.page.reload();
  await login(ctx).waitCoreImpl("async", 10_000);
  await ctx.page.goto(`${ctx.baseURL}/?core=rxjs`);
  await login(ctx).waitCoreImpl("rxjs", 10_000);
  await ctx.page.goto(`${ctx.baseURL}/?core=bogus`);
  await login(ctx).waitCoreImpl("async", 10_000); // unknown param ignored → stored choice
}
```
(adapt names to the real helpers — `ctx.page`, `ctx.baseURL`, sign-in — as the existing scenarios spell them.)
- [ ] **Step 2: Run** `pnpm --filter @rtc/tests test:browser:playwright -- coreSwitch` before Tasks 4/5 are complete would fail; run it now (after them) — Expected: PASS. Then run it with the row's `select` mutated to a no-op → FAIL (mutation proof).
- [ ] **Step 3:** Confirm it is picked up by `test:browser:playwright:solid` too (it runs the same specs against Solid) — PASS.
- [ ] **Step 4: Commit** `test(e2e): core switch round trip — ?core=, Preferences save + reload, persistence`.

---

### Task 8: Docs, STATUS, goldens

**Files:**
- Modify: `docs/adr/ADR-006-pluggable-application-core.md` — new `## Decision 6: Load-time core selection (supersedes build-time-only selection)` after Decision 5; update Consequences ~128-132 (production ships all three; guard is per chunk); Follow-ups: add hot swap and approach B.
- Modify: `docs/architecture/22-pluggable-application-core.md` — retitle/rewrite `## Selection: build-time, not runtime` (line 84) to `## Selection: at load time`, covering precedence, lazy chunks, the boot error, `check:core-bundle`'s new rules and the deploy guard.
- Modify: `README.md` "Choosing an application core" (add `?core=` and the Preferences row; "One core per build" bullet becomes "Alternative cores load lazily"; "Restart to switch" becomes "Switch at load time").
- Modify: `CLAUDE.md` (Current Status sentence "selectable via `VITE_CORE_IMPL`" → "selectable at load time (`?core=`, Preferences) with `VITE_CORE_IMPL` as the build default"; Application core rule's `check:core-bundle` sentence).
- Modify: `docs/STATUS.md` — remove the 🔴 entry once merged work lands (in the same PR: remove it, and add a ⚪ entry "Runtime core switch — follow-ups: hot swap without reload; all three cores lazy (approach B)").
- Goldens: the new row changes `prefs/modal` and `prefs/content`. Regenerate per the repo recipe (memory: `update-visual-goldens.yml` dispatch with `scenario_pattern` matching `prefs/`, plus the local darwin set), inspect the diff shows only the new row, commit.

- [ ] **Step 1:** Edit the docs. **Step 2:** `pnpm check:doc-links` exit 0. **Step 3:** Dispatch golden regen for `prefs/` on the branch, wait, pull the artifact per the recipe, inspect, commit. **Step 4: Commit** `docs: load-time core selection — ADR-006 Decision 6, §22, README, CLAUDE.md, STATUS`.

---

### Task 9: Final gate and ship

- [ ] Full gauntlet on the final tree (`/rtc:gauntlet full` equivalent, 33 gates), `pnpm test:e2e`, `pnpm test:e2e:async`, `pnpm test:e2e:effect` (each logs `[run-all] application core: …` — read it), one independent reviewer, fix Important/Minor findings in the PR, then the standard ship flow (CI green, CodeQL 0 open, main unmoved or non-overlapping, merge, cleanup).
- [ ] After merge: dispatch `deploy.yml` only with the user's explicit go (deploys are outward-facing), then check the deployed app: `/?core=effect` boots Effect, Preferences switches, network tab shows the alt-core chunk fetched lazily.
