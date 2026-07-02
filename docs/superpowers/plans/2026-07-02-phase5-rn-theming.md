# Phase 5 — RN Theming (skin × mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the web client's four-skin × light/dark theming to `@rtc/client-react-native` — all four skins (`classic`/`holo`/`terminal`/`neon`) × `dark`/`light`/`system`, switchable from a new Appearance tab, re-painting every RN leaf.

**Architecture:** A pure View phase. The theme *state* (skin/mode preference, `resolveThemeMode`, persistence) already exists framework-neutrally in `domain`/`client-core`/`react-bindings` and the RN `AsyncStoragePreferencesAdapter`. This plan adds only the RN paint layer: an `RnTheme` token store (values transcribed 1-to-1 from the web `tokens.ts`, CSS-only FX flattened), a React-context `ThemeProvider`/`useTheme`/`useThemedStyles`, bundled `@expo-google-fonts` typography, an `Appearance`-API `colorScheme` adapter, and a 4th Appearance tab. No `domain`/`client-core`/`react-bindings`/web changes.

**Tech Stack:** Expo SDK 55, React Native 0.83, expo-router, react-native-svg, `expo-font` + `@expo-google-fonts/*`, RxJS, jest-expo (`.test.tsx`) + vitest (`.test.ts`).

**Spec:** `docs/superpowers/specs/2026-07-02-phase5-rn-theming-design.md`

## Global Constraints

- All changes live under `packages/client-react-native/`. **No** changes to `domain`, `client-core`, `react-bindings`, or the web `client-react`.
- The mode control reuses the existing `useThemePreference().cycle()` — do **not** add `setMode` to `react-bindings`.
- Expo SDK 55 / RN 0.83, **Expo-Go-compatible** — no custom native modules. Add native/asset deps with `expo install` (SDK-pinned exact version, no caret — same rule that pinned `react-native-svg@15.15.3`).
- **Test island:** `.test.ts` → vitest node (needs `import { expect, test } from "vitest"` and the `#/` alias from `vitest.config.ts`); `.test.tsx` → jest-expo (RNTL 14: `render` is async — `await render`; import globals from `@jest/globals`). RN `test` script runs both: `vitest run --passWithNoTests && jest`.
- Any package imported by a **jest-tested** file that ships untranspiled ESM must be added to the jest `transformIgnorePatterns` allowlist in `jest.config.js` (the react-native-svg lesson). `@expo-google-fonts/*` is **not** covered by the existing `@expo(nent)?` entry — it must be added.
- `react-native-svg` `<Circle fill>` / `<Path stroke>` under jest render as `processColor`'d objects: assert `expect.objectContaining({ payload: processColor(value) })`, never raw-string equality. Plain RN `<View>`/`<Text>` style colours keep the raw string.
- **No inline `style={{…}}` object literals** and no inline object PARAM types (repo `no-restricted-syntax`) — use the `makeStyles(t)` factory pattern and named RN types.
- ESLint/Biome footguns: `arrow-body-style` wants braces but Biome `useExplicitType` then wants a return type (write braces + explicit return type, or use brace-less inline callbacks which are return-type-exempt). Expo Router route files need a default export (scoped Biome `noDefaultExport:off` for `app/**` already configured).
- **`tokens.ts` and `fontFamilies.ts` must NOT import from `react-native`** (or any RN/Expo module) — they are vitest-tested (`.test.ts`), and vitest cannot parse RN's Flow source. Keep them pure data + string constants.
- The controller re-verifies the full gauntlet first-hand with real exit codes after every task: `pnpm --filter @rtc/client-react-native typecheck`, `test`, `pnpm build`, `eslint .`, `eslint . --config eslint.config.typed.mjs` (from repo root or the package), stylelint/knip/syncpack at repo scope, and `expo export` at the end.

---

### Task 1: RnTheme token store

Pure data: the `RnTheme` interface + `rnThemeTokens[skin][mode]`, values transcribed 1-to-1 from the web `packages/client-react/src/ui/shell/theme/tokens.ts` with CSS-only FX keys dropped, `var()` refs resolved to concrete values, and two font-family fields. **No `react-native` import** (vitest-tested).

**Files:**
- Create: `packages/client-react-native/src/ui/theme/fontFamilies.ts`
- Create: `packages/client-react-native/src/ui/theme/tokens.ts`
- Test: `packages/client-react-native/src/ui/theme/tokens.test.ts`

**Interfaces:**
- Produces: `interface RnTheme` (29 keys, below); `const rnThemeTokens: Record<ThemeSkin, Record<ThemeMode, RnTheme>>`; font-family string constants `FONT_CHAKRA_DISPLAY`, `FONT_JETBRAINS_MONO`, `FONT_IBM_SANS`, `FONT_IBM_MONO`.
- Consumes: `ThemeSkin`, `ThemeMode` from `@rtc/domain`.

- [ ] **Step 1: Write `fontFamilies.ts`** (pure string constants — the family names `@expo-google-fonts` registers; also the `useFonts` keys in Task 3)

```ts
// packages/client-react-native/src/ui/theme/fontFamilies.ts
/**
 * Font-family name strings shared by the token store (which references them)
 * and the font loader (Task 3, which registers them via `useFonts`). Kept in a
 * dependency-free module so `tokens.ts` stays importable under vitest — the
 * `@expo-google-fonts` packages pull in react-native and cannot be parsed there.
 * Each constant equals the export name of the corresponding `@expo-google-fonts`
 * font module, which is also the family name RN resolves at paint time.
 */
export const FONT_CHAKRA_DISPLAY = "ChakraPetch_500Medium";
export const FONT_JETBRAINS_MONO = "JetBrainsMono_400Regular";
export const FONT_IBM_SANS = "IBMPlexSans_400Regular";
export const FONT_IBM_MONO = "IBMPlexMono_400Regular";
```

- [ ] **Step 2: Write the failing token test**

```ts
// packages/client-react-native/src/ui/theme/tokens.test.ts
import { expect, test } from "vitest";

import { THEME_MODES, THEME_SKINS } from "@rtc/domain";

import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";

const COLOUR_KEYS: readonly (keyof RnTheme)[] = [
  "bgPrimary", "bgSecondary", "bgHeader", "bgFooter", "bgTile", "bgOverlay",
  "bgBrandPrimary", "textPrimary", "textSecondary", "textMuted", "textOnAccent",
  "accentPositive", "accentNegative", "accentAware", "accentPrimary", "accent2",
  "borderPrimary", "borderSubtle", "border", "borderStrong",
  "statusConnected", "statusConnecting", "statusDisconnected", "statusError",
  "panel", "panelHead", "chip",
];

const COLOUR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s]+\))$/;

test("every skin × mode cell defines all colour keys as valid colour strings", () => {
  for (const skin of THEME_SKINS) {
    for (const mode of THEME_MODES) {
      const cell = rnThemeTokens[skin][mode];
      for (const key of COLOUR_KEYS) {
        const value = cell[key];
        expect(value, `${skin}.${mode}.${key}`).toMatch(COLOUR);
      }
    }
  }
});

test("no cell leaks a CSS var() reference", () => {
  for (const skin of THEME_SKINS) {
    for (const mode of THEME_MODES) {
      for (const value of Object.values(rnThemeTokens[skin][mode])) {
        if (typeof value === "string") {
          expect(value.includes("var(")).toBe(false);
        }
      }
    }
  }
});

test("classic uses system fonts; the other skins bind a display + mono family", () => {
  expect(rnThemeTokens.classic.dark.fontDisplay).toBeUndefined();
  expect(rnThemeTokens.classic.dark.fontMono).toBeUndefined();
  expect(rnThemeTokens.holo.dark.fontDisplay).toBe("ChakraPetch_500Medium");
  expect(rnThemeTokens.terminal.dark.fontMono).toBe("IBMPlexMono_400Regular");
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/theme/tokens.test.ts`
Expected: FAIL — cannot resolve `#/ui/theme/tokens`.

- [ ] **Step 4: Write `tokens.ts`** — the full store. Values are transcribed verbatim from the web `tokens.ts` cells; the six FX keys (`--panel-blur`, `--glow`, `--grid`, `--aurora-a`, `--aurora-b`, `--aurora-opacity`) are omitted; `panel`/`panelHead` resolve their `var()` targets; fonts come from `fontFamilies.ts`.

```ts
// packages/client-react-native/src/ui/theme/tokens.ts
import type { ThemeMode, ThemeSkin } from "@rtc/domain";

import {
  FONT_CHAKRA_DISPLAY,
  FONT_IBM_MONO,
  FONT_IBM_SANS,
  FONT_JETBRAINS_MONO,
} from "#/ui/theme/fontFamilies";

/**
 * The RN-native theme surface: the plain-colour subset of the web's CSS token
 * set (packages/client-react/src/ui/shell/theme/tokens.ts), camelCased, with all
 * `var()` refs pre-resolved and the CSS-only FX keys (blur/glow/grid/aurora)
 * dropped — those belong to the deferred animation phase. Font fields hold a
 * bundled family name (or `undefined` = RN system default, for `classic`).
 */
export interface RnTheme {
  readonly bgPrimary: string;
  readonly bgSecondary: string;
  readonly bgHeader: string;
  readonly bgFooter: string;
  readonly bgTile: string;
  readonly bgOverlay: string;
  readonly bgBrandPrimary: string;

  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly textOnAccent: string;

  readonly accentPositive: string;
  readonly accentNegative: string;
  readonly accentAware: string;
  readonly accentPrimary: string;
  readonly accent2: string;

  readonly borderPrimary: string;
  readonly borderSubtle: string;
  readonly border: string;
  readonly borderStrong: string;

  readonly statusConnected: string;
  readonly statusConnecting: string;
  readonly statusDisconnected: string;
  readonly statusError: string;

  readonly panel: string;
  readonly panelHead: string;
  readonly chip: string;

  /** Display font family, or `undefined` for the platform default (classic). */
  readonly fontDisplay: string | undefined;
  /** Mono font family, or `undefined` for the platform default (classic). */
  readonly fontMono: string | undefined;
}

const classicDark: RnTheme = {
  bgPrimary: "#111827", bgSecondary: "#1f2937", bgHeader: "#0f172a",
  bgFooter: "#0f172a", bgTile: "#1e293b", bgOverlay: "rgba(0, 0, 0, 0.75)",
  bgBrandPrimary: "#3b82f6",
  textPrimary: "#f1f5f9", textSecondary: "#94a3b8", textMuted: "#64748b",
  textOnAccent: "#fff",
  accentPositive: "#22c55e", accentNegative: "#ef4444", accentAware: "#f59e0b",
  accentPrimary: "#3b82f6", accent2: "#60a5fa",
  borderPrimary: "#334155", borderSubtle: "#1e293b", border: "#1e293b",
  borderStrong: "#475569",
  statusConnected: "#22c55e", statusConnecting: "#f59e0b",
  statusDisconnected: "#ef4444", statusError: "#d32f2f",
  panel: "#1e293b", panelHead: "#1f2937", chip: "rgba(59,130,246,0.12)",
  fontDisplay: undefined, fontMono: undefined,
};

const classicLight: RnTheme = {
  bgPrimary: "#f8fafc", bgSecondary: "#f1f5f9", bgHeader: "#ffffff",
  bgFooter: "#ffffff", bgTile: "#ffffff", bgOverlay: "rgba(0, 0, 0, 0.5)",
  bgBrandPrimary: "#2563eb",
  textPrimary: "#0f172a", textSecondary: "#475569", textMuted: "#94a3b8",
  textOnAccent: "#fff",
  accentPositive: "#16a34a", accentNegative: "#dc2626", accentAware: "#d97706",
  accentPrimary: "#2563eb", accent2: "#60a5fa",
  borderPrimary: "#e2e8f0", borderSubtle: "#f1f5f9", border: "#f1f5f9",
  borderStrong: "#475569",
  statusConnected: "#16a34a", statusConnecting: "#d97706",
  statusDisconnected: "#dc2626", statusError: "#d32f2f",
  panel: "#ffffff", panelHead: "#f1f5f9", chip: "rgba(59,130,246,0.12)",
  fontDisplay: undefined, fontMono: undefined,
};

const holoDark: RnTheme = {
  bgPrimary: "#00060a", bgSecondary: "#02121d", bgHeader: "#02121d",
  bgFooter: "#02121d", bgTile: "rgba(6,26,38,0.5)", bgOverlay: "rgba(0,6,10,0.78)",
  bgBrandPrimary: "#00e5ff",
  textPrimary: "#d6f7ff", textSecondary: "rgba(150,210,228,0.62)",
  textMuted: "rgba(120,190,210,0.42)", textOnAccent: "#00060a",
  accentPositive: "#2bffb3", accentNegative: "#ff5d73", accentAware: "#ffb000",
  accentPrimary: "#00e5ff", accent2: "#19ffd0",
  borderPrimary: "rgba(0,224,255,0.26)", borderSubtle: "rgba(0,224,255,0.12)",
  border: "rgba(0,224,255,0.12)", borderStrong: "rgba(0,224,255,0.6)",
  statusConnected: "#2bffb3", statusConnecting: "#ffb000",
  statusDisconnected: "#ff5d73", statusError: "#ff5d73",
  panel: "rgba(6,26,38,0.5)", panelHead: "rgba(0,224,255,0.06)",
  chip: "rgba(0,224,255,0.12)",
  fontDisplay: FONT_CHAKRA_DISPLAY, fontMono: FONT_JETBRAINS_MONO,
};

const holoLight: RnTheme = {
  bgPrimary: "#e8f9fd", bgSecondary: "#cdf1f9", bgHeader: "#ffffff",
  bgFooter: "#ffffff", bgTile: "rgba(200,240,250,0.7)",
  bgOverlay: "rgba(0,6,10,0.4)", bgBrandPrimary: "#00b4cc",
  textPrimary: "#002a35", textSecondary: "rgba(0,60,80,0.7)",
  textMuted: "rgba(0,60,80,0.45)", textOnAccent: "#ffffff",
  accentPositive: "#00c985", accentNegative: "#e8304a", accentAware: "#cc8800",
  accentPrimary: "#00b4cc", accent2: "#00cc9e",
  borderPrimary: "rgba(0,180,204,0.3)", borderSubtle: "rgba(0,180,204,0.15)",
  border: "rgba(0,180,204,0.15)", borderStrong: "rgba(0,180,204,0.65)",
  statusConnected: "#00c985", statusConnecting: "#cc8800",
  statusDisconnected: "#e8304a", statusError: "#e8304a",
  panel: "rgba(200,240,250,0.7)", panelHead: "rgba(0,180,204,0.08)",
  chip: "rgba(0,180,204,0.14)",
  fontDisplay: FONT_CHAKRA_DISPLAY, fontMono: FONT_JETBRAINS_MONO,
};

const terminalDark: RnTheme = {
  bgPrimary: "#0a0c10", bgSecondary: "#0e1116", bgHeader: "#0e1116",
  bgFooter: "#0e1116", bgTile: "#13161c", bgOverlay: "rgba(10,12,16,0.8)",
  bgBrandPrimary: "#ffb000",
  textPrimary: "#e8ebf1", textSecondary: "#8b93a1", textMuted: "#59616e",
  textOnAccent: "#0a0c10",
  accentPositive: "#37d27e", accentNegative: "#ff5b52", accentAware: "#ffb000",
  accentPrimary: "#ffb000", accent2: "#4a9eff",
  borderPrimary: "#262b34", borderSubtle: "#1a1e25", border: "#1a1e25",
  borderStrong: "#3a4351",
  statusConnected: "#37d27e", statusConnecting: "#ffb000",
  statusDisconnected: "#ff5b52", statusError: "#ff5b52",
  panel: "#13161c", panelHead: "#171b22", chip: "rgba(255,176,0,0.14)",
  fontDisplay: FONT_IBM_SANS, fontMono: FONT_IBM_MONO,
};

const terminalLight: RnTheme = {
  bgPrimary: "#f4f5f7", bgSecondary: "#eaecef", bgHeader: "#ffffff",
  bgFooter: "#ffffff", bgTile: "#ffffff", bgOverlay: "rgba(10,12,16,0.35)",
  bgBrandPrimary: "#b37a00",
  textPrimary: "#12151c", textSecondary: "#3e4452", textMuted: "#6b7280",
  textOnAccent: "#ffffff",
  accentPositive: "#1fa856", accentNegative: "#d93a33", accentAware: "#b37a00",
  accentPrimary: "#b37a00", accent2: "#2e6db5",
  borderPrimary: "#c8cdd6", borderSubtle: "#e2e5ea", border: "#e2e5ea",
  borderStrong: "#9098a8",
  statusConnected: "#1fa856", statusConnecting: "#b37a00",
  statusDisconnected: "#d93a33", statusError: "#d93a33",
  panel: "#ffffff", panelHead: "#f0f2f5", chip: "rgba(179,122,0,0.12)",
  fontDisplay: FONT_IBM_SANS, fontMono: FONT_IBM_MONO,
};

const neonDark: RnTheme = {
  bgPrimary: "#070210", bgSecondary: "#12041f", bgHeader: "#12041f",
  bgFooter: "#12041f", bgTile: "rgba(28,6,46,0.52)", bgOverlay: "rgba(7,2,16,0.8)",
  bgBrandPrimary: "#ff2bd6",
  textPrimary: "#f7e9ff", textSecondary: "rgba(214,160,235,0.7)",
  textMuted: "rgba(180,120,210,0.45)", textOnAccent: "#070210",
  accentPositive: "#00ffa3", accentNegative: "#ff3864", accentAware: "#ffb000",
  accentPrimary: "#ff2bd6", accent2: "#00f0ff",
  borderPrimary: "rgba(255,43,214,0.36)", borderSubtle: "rgba(255,43,214,0.18)",
  border: "rgba(255,43,214,0.18)", borderStrong: "rgba(255,43,214,0.72)",
  statusConnected: "#00ffa3", statusConnecting: "#ffb000",
  statusDisconnected: "#ff3864", statusError: "#ff3864",
  panel: "rgba(28,6,46,0.52)", panelHead: "rgba(255,43,214,0.08)",
  chip: "rgba(255,43,214,0.14)",
  fontDisplay: FONT_CHAKRA_DISPLAY, fontMono: FONT_JETBRAINS_MONO,
};

const neonLight: RnTheme = {
  bgPrimary: "#faf0fe", bgSecondary: "#f3e0fc", bgHeader: "#ffffff",
  bgFooter: "#ffffff", bgTile: "rgba(240,210,255,0.65)",
  bgOverlay: "rgba(7,2,16,0.35)", bgBrandPrimary: "#c800a0",
  textPrimary: "#1a0030", textSecondary: "rgba(80,10,120,0.75)",
  textMuted: "rgba(80,10,120,0.5)", textOnAccent: "#ffffff",
  accentPositive: "#00c97e", accentNegative: "#e8304a", accentAware: "#cc8800",
  accentPrimary: "#c800a0", accent2: "#00b8cc",
  borderPrimary: "rgba(200,0,160,0.3)", borderSubtle: "rgba(200,0,160,0.15)",
  border: "rgba(200,0,160,0.15)", borderStrong: "rgba(200,0,160,0.65)",
  statusConnected: "#00c97e", statusConnecting: "#cc8800",
  statusDisconnected: "#e8304a", statusError: "#e8304a",
  panel: "rgba(240,210,255,0.65)", panelHead: "rgba(200,0,160,0.08)",
  chip: "rgba(200,0,160,0.12)",
  fontDisplay: FONT_CHAKRA_DISPLAY, fontMono: FONT_JETBRAINS_MONO,
};

export const rnThemeTokens: Record<ThemeSkin, Record<ThemeMode, RnTheme>> = {
  classic: { dark: classicDark, light: classicLight },
  holo: { dark: holoDark, light: holoLight },
  terminal: { dark: terminalDark, light: terminalLight },
  neon: { dark: neonDark, light: neonLight },
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/theme/tokens.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/theme/fontFamilies.ts \
        packages/client-react-native/src/ui/theme/tokens.ts \
        packages/client-react-native/src/ui/theme/tokens.test.ts
git commit -m "feat(rn): RnTheme token store — 4 skins × dark/light, FX flattened"
```

---

### Task 2: ThemeProvider, useTheme, useThemedStyles, and a test wrapper

The React-context plumbing: a context of `RnTheme`, a `ThemeProvider` that reads the two ViewModel hooks and resolves the cell, a `useTheme` consumer, a `useThemedStyles` factory hook, and a `renderWithTheme` test helper used by all later leaf tests.

**Files:**
- Create: `packages/client-react-native/src/ui/theme/ThemeContext.ts`
- Create: `packages/client-react-native/src/ui/theme/useTheme.ts`
- Create: `packages/client-react-native/src/ui/theme/useThemedStyles.ts`
- Create: `packages/client-react-native/src/ui/theme/ThemeProvider.tsx`
- Create: `packages/client-react-native/src/ui/theme/renderWithTheme.tsx` (test helper)
- Test: `packages/client-react-native/src/ui/theme/ThemeProvider.test.tsx`

**Interfaces:**
- Consumes: `RnTheme`, `rnThemeTokens` (Task 1); `useViewModel` → `useThemePreference() {mode}`, `useThemeSkinPreference() {skin}` (react-bindings).
- Produces: `ThemeContext` (`React.Context<RnTheme | null>`); `ThemeProvider` (`{children}` → provider); `useTheme(): RnTheme` (throws outside a provider); `useThemedStyles<T>(make: (t: RnTheme) => T): T`; `renderWithTheme(ui, theme?)` (RNTL render wrapped in a fixed-theme context; default `rnThemeTokens.holo.dark`).

- [ ] **Step 1: Write `ThemeContext.ts`**

```ts
// packages/client-react-native/src/ui/theme/ThemeContext.ts
import { createContext } from "react";

import type { RnTheme } from "#/ui/theme/tokens";

/** The resolved theme for the current skin × mode. `null` outside a provider —
 * `useTheme` turns that into a thrown error. */
export const ThemeContext = createContext<RnTheme | null>(null);
```

- [ ] **Step 2: Write `useTheme.ts`**

```ts
// packages/client-react-native/src/ui/theme/useTheme.ts
import { useContext } from "react";

import { ThemeContext } from "#/ui/theme/ThemeContext";
import type { RnTheme } from "#/ui/theme/tokens";

export function useTheme(): RnTheme {
  const theme = useContext(ThemeContext);
  if (theme === null) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return theme;
}
```

- [ ] **Step 3: Write `useThemedStyles.ts`**

```ts
// packages/client-react-native/src/ui/theme/useThemedStyles.ts
import { useMemo } from "react";

import { useTheme } from "#/ui/theme/useTheme";
import type { RnTheme } from "#/ui/theme/tokens";

/** Build a StyleSheet from the current theme, recomputing only when the theme
 * object identity changes. `make` is a module-level factory (stable identity),
 * so styles are memoised across renders within one theme. */
export function useThemedStyles<T>(make: (theme: RnTheme) => T): T {
  const theme = useTheme();
  return useMemo(() => {
    return make(theme);
  }, [theme, make]);
}
```

- [ ] **Step 4: Write `ThemeProvider.tsx`**

```tsx
// packages/client-react-native/src/ui/theme/ThemeProvider.tsx
import type { JSX, ReactNode } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

/** Resolves the active `skin × mode` cell from the ViewModel's theme
 * preferences and provides it to the tree. The RN analogue of client-react's
 * ThemeProvider — but instead of painting CSS vars on :root, it hands the
 * resolved token object down through React context for leaves to consume via
 * `useTheme` / `useThemedStyles`. Persistence, mode resolution (system → OS),
 * and the skin/mode choice all live behind the ViewModel seam; this only reads
 * the resolved values and selects the token cell. */
export function ThemeProvider({ children }: ThemeProviderProps): JSX.Element {
  const { useThemePreference, useThemeSkinPreference } = useViewModel();
  const { mode } = useThemePreference();
  const { skin } = useThemeSkinPreference();

  return (
    <ThemeContext.Provider value={rnThemeTokens[skin][mode]}>
      {children}
    </ThemeContext.Provider>
  );
}

interface ThemeProviderProps {
  children: ReactNode;
}
```

- [ ] **Step 5: Write `renderWithTheme.tsx`** (test helper — a fixed theme context, no ViewModel needed, so leaf tests stay decoupled)

```tsx
// packages/client-react-native/src/ui/theme/renderWithTheme.tsx
import { render, type RenderResult } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { ThemeContext } from "#/ui/theme/ThemeContext";
import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";

/** Render a leaf under a fixed theme (default: holo/dark) without a ViewModel —
 * leaves consume `useTheme`/`ThemeContext`, not the provider, so tests inject
 * the theme directly. Returns the RNTL result plus the theme used, so colour
 * assertions can reference the exact cell. */
export function renderWithTheme(
  ui: ReactElement,
  theme: RnTheme = rnThemeTokens.holo.dark,
): Promise<RenderResult> {
  return render(<ThemeContext.Provider value={theme}>{ui}</ThemeContext.Provider>);
}
```

- [ ] **Step 6: Write the failing provider/context test**

```tsx
// packages/client-react-native/src/ui/theme/ThemeProvider.test.tsx
import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { ThemeProvider } from "#/ui/theme/ThemeProvider";
import { rnThemeTokens } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";

function Probe(): React.JSX.Element {
  const theme = useTheme();
  return <Text testID="probe">{theme.bgTile}</Text>;
}

function fakeViewModel(skin: string, mode: string): ViewModel {
  return {
    useThemePreference: () => {
      return { mode, modePreference: mode, cycle: () => {} };
    },
    useThemeSkinPreference: () => {
      return { skin, setSkin: () => {} };
    },
  } as unknown as ViewModel;
}

test("provides the token cell for the resolved skin × mode", async () => {
  await render(
    <ViewModelProvider viewModel={fakeViewModel("terminal", "light")}>
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("probe").props.children).toBe(
    rnThemeTokens.terminal.light.bgTile,
  );
});

test("useTheme throws outside a provider", () => {
  expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/theme/ThemeProvider.test.tsx`
Expected: FAIL — module not found (before Steps 1–4) or assertion mismatch.

- [ ] **Step 8: Run the test to verify it passes** (after all files exist)

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/theme/ThemeProvider.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add packages/client-react-native/src/ui/theme/ThemeContext.ts \
        packages/client-react-native/src/ui/theme/useTheme.ts \
        packages/client-react-native/src/ui/theme/useThemedStyles.ts \
        packages/client-react-native/src/ui/theme/ThemeProvider.tsx \
        packages/client-react-native/src/ui/theme/renderWithTheme.tsx \
        packages/client-react-native/src/ui/theme/ThemeProvider.test.tsx
git commit -m "feat(rn): ThemeProvider/useTheme/useThemedStyles + test wrapper"
```

---

### Task 3: Bundled fonts (`@expo-google-fonts` + `expo-font`)

The font loader `useAppFonts()` plus the deps and the jest allowlist entry. Registers the four bundled families (keyed by the `fontFamilies.ts` constants) so the token font names resolve at paint time.

**Files:**
- Create: `packages/client-react-native/src/ui/theme/fonts.ts`
- Modify: `packages/client-react-native/package.json` (deps)
- Modify: `packages/client-react-native/jest.config.js` (transformIgnorePatterns)
- Test: `packages/client-react-native/src/ui/theme/fonts.test.tsx`

**Interfaces:**
- Consumes: `FONT_*` constants (Task 1); `useFonts` from `@expo-google-fonts/*`.
- Produces: `useAppFonts(): boolean` (true once all four families are loaded).

- [ ] **Step 1: Install the deps** (SDK-pinned via expo install; run from the package dir)

```bash
cd packages/client-react-native
npx expo install expo-font @expo-google-fonts/chakra-petch \
  @expo-google-fonts/jetbrains-mono @expo-google-fonts/ibm-plex-sans \
  @expo-google-fonts/ibm-plex-mono
```
Expected: `package.json` gains the five deps at SDK-validated versions. If `expo install` cannot pin an `@expo-google-fonts/*` package to an SDK version, accept the latest published version (these are JS-only font packages, Expo-Go-safe).

- [ ] **Step 2: Add `@expo-google-fonts` to the jest allowlist** — edit `jest.config.js`, appending `|@expo-google-fonts/.*` inside the `transformIgnorePatterns` alternation (it is NOT covered by the existing `@expo(nent)?` entry):

```js
  transformIgnorePatterns: [
    "node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@testing-library/react-native|@react-rxjs/.*|@rx-state/.*|react-native-svg|@expo-google-fonts/.*))",
  ],
```

- [ ] **Step 3: Write `fonts.ts`**

```ts
// packages/client-react-native/src/ui/theme/fonts.ts
import { ChakraPetch_500Medium } from "@expo-google-fonts/chakra-petch";
import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono";
import { IBMPlexSans_400Regular } from "@expo-google-fonts/ibm-plex-sans";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { useFonts } from "expo-font";

import {
  FONT_CHAKRA_DISPLAY,
  FONT_IBM_MONO,
  FONT_IBM_SANS,
  FONT_JETBRAINS_MONO,
} from "#/ui/theme/fontFamilies";

/** Loads the four bundled skin fonts, registered under the exact family names
 * the token store references (`fontFamilies.ts`). Returns true once all are
 * ready; `_layout` gates first paint on it so no leaf paints a not-yet-loaded
 * family. `classic` needs no bundled font (system default), so it is absent. */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    [FONT_CHAKRA_DISPLAY]: ChakraPetch_500Medium,
    [FONT_JETBRAINS_MONO]: JetBrainsMono_400Regular,
    [FONT_IBM_SANS]: IBMPlexSans_400Regular,
    [FONT_IBM_MONO]: IBMPlexMono_400Regular,
  });
  return loaded;
}
```

- [ ] **Step 4: Write the failing font test** (jest-expo mocks `expo-font`'s `useFonts` to report loaded)

```tsx
// packages/client-react-native/src/ui/theme/fonts.test.tsx
import { expect, test } from "@jest/globals";
import { renderHook } from "@testing-library/react-native";

import { useAppFonts } from "#/ui/theme/fonts";

test("reports a boolean load state for the bundled fonts", () => {
  const { result } = renderHook(() => {
    return useAppFonts();
  });
  expect(typeof result.current).toBe("boolean");
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/theme/fonts.test.tsx`
Expected: FAIL before `fonts.ts` exists (module not found).

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/theme/fonts.test.tsx`
Expected: PASS. If it fails to parse `@expo-google-fonts/*`, confirm Step 2's allowlist edit landed.

- [ ] **Step 7: Commit**

```bash
git add packages/client-react-native/package.json \
        packages/client-react-native/jest.config.js \
        packages/client-react-native/src/ui/theme/fonts.ts \
        packages/client-react-native/src/ui/theme/fonts.test.tsx \
        pnpm-lock.yaml
git commit -m "feat(rn): bundle skin fonts via @expo-google-fonts + useAppFonts"
```

---

### Task 4: AppearanceColorSchemeAdapter + buildNativePorts wiring

An `Appearance`-backed `ColorSchemeSource` so `"system"` mode follows the device setting live, wired into both branches of `buildNativePorts`. Mirrors the web `MediaQueryColorSchemeAdapter`.

**Files:**
- Create: `packages/client-react-native/src/app/adapters/AppearanceColorSchemeAdapter.ts`
- Modify: `packages/client-react-native/src/app/buildNativePorts.ts`
- Test: `packages/client-react-native/src/app/adapters/AppearanceColorSchemeAdapter.test.tsx`

**Interfaces:**
- Consumes: `ColorSchemeSource` from `@rtc/client-core`; `Appearance` from `react-native`.
- Produces: `class AppearanceColorSchemeAdapter implements ColorSchemeSource` with `prefersDark$(): Observable<boolean>`.

- [ ] **Step 1: Write the failing adapter test** (jest — imports `react-native`; mock `Appearance`)

```tsx
// packages/client-react-native/src/app/adapters/AppearanceColorSchemeAdapter.test.tsx
import { expect, jest, test } from "@jest/globals";
import { firstValueFrom } from "rxjs";

import { AppearanceColorSchemeAdapter } from "#/app/adapters/AppearanceColorSchemeAdapter";

type ChangeListener = (pref: { colorScheme: "dark" | "light" | null }) => void;

function mockAppearance(initial: "dark" | "light" | null) {
  let listener: ChangeListener | null = null;
  return {
    getColorScheme: jest.fn(() => {
      return initial;
    }),
    addChangeListener: jest.fn((cb: ChangeListener) => {
      listener = cb;
      return { remove: jest.fn() };
    }),
    emit: (scheme: "dark" | "light" | null) => {
      listener?.({ colorScheme: scheme });
    },
  };
}

test("seeds prefersDark from the current OS scheme", async () => {
  const appearance = mockAppearance("dark");
  const adapter = new AppearanceColorSchemeAdapter(appearance);
  expect(await firstValueFrom(adapter.prefersDark$())).toBe(true);
});

test("emits false when the OS reports light or null", async () => {
  const adapter = new AppearanceColorSchemeAdapter(mockAppearance(null));
  expect(await firstValueFrom(adapter.prefersDark$())).toBe(false);
});

test("pushes a new value when the OS scheme changes", async () => {
  const appearance = mockAppearance("light");
  const adapter = new AppearanceColorSchemeAdapter(appearance);
  const seen: boolean[] = [];
  const sub = adapter.prefersDark$().subscribe((v) => {
    seen.push(v);
  });
  appearance.emit("dark");
  sub.unsubscribe();
  expect(seen).toEqual([false, true]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/app/adapters/AppearanceColorSchemeAdapter.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the adapter** — the RN `Appearance` API is injected (default: the real module) so the pure reactive logic is testable with a fake.

```ts
// packages/client-react-native/src/app/adapters/AppearanceColorSchemeAdapter.ts
import { Appearance } from "react-native";
import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";

import type { ColorSchemeSource } from "@rtc/client-core";

/** The minimal slice of RN's `Appearance` this adapter needs — injected so the
 * reactive logic is unit-testable without the native module. */
interface AppearanceLike {
  getColorScheme(): "dark" | "light" | null;
  addChangeListener(
    listener: (pref: { colorScheme: "dark" | "light" | null }) => void,
  ): { remove: () => void };
}

/**
 * RN `ColorSchemeSource` backed by `Appearance`. Seeds a BehaviorSubject from
 * the current OS scheme (so subscribers get a value synchronously — no flash)
 * and pushes on every change. The RN analogue of the web
 * `MediaQueryColorSchemeAdapter`; a single instance owned by the composition
 * root for the app's lifetime, so the change listener is not torn down.
 */
export class AppearanceColorSchemeAdapter implements ColorSchemeSource {
  private readonly dark: BehaviorSubject<boolean>;

  constructor(private readonly appearance: AppearanceLike = Appearance) {
    this.dark = new BehaviorSubject<boolean>(
      appearance.getColorScheme() === "dark",
    );
    appearance.addChangeListener((pref) => {
      this.dark.next(pref.colorScheme === "dark");
    });
  }

  prefersDark$(): Observable<boolean> {
    return this.dark.pipe(distinctUntilChanged());
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest src/app/adapters/AppearanceColorSchemeAdapter.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire it into `buildNativePorts.ts`** — construct one adapter and spread it into both branch return objects. Add the import, instantiate after `preferences`, and add `colorScheme` to each `ports` object. Also delete the now-inaccurate "colorScheme port is dropped" sentence from the doc comment.

Add the import (with the other `#/app` import):
```ts
import { AppearanceColorSchemeAdapter } from "#/app/adapters/AppearanceColorSchemeAdapter";
```
After `const preferences = new AsyncStoragePreferencesAdapter();` add:
```ts
  const colorScheme = new AppearanceColorSchemeAdapter();
```
Real-WS branch return becomes:
```ts
    return {
      ports: {
        ...createWsRealPorts(ws, { preferences }),
        connectionEvents,
        colorScheme,
      },
      dispose: () => {
        ws.dispose();
      },
    };
```
Simulator branch return becomes:
```ts
  return {
    ports: {
      ...createSimulatorPorts({ preferences }),
      connectionEvents,
      colorScheme,
    },
    dispose: () => {},
  };
```
And update the doc comment: replace "There is no DOM here, so the browser connectivity source and `colorScheme` port are both dropped (`colorScheme` is optional; client-core's `of(false)` fallback applies)." with "There is no DOM here, so the browser connectivity source is dropped; `colorScheme` is supplied by an `Appearance`-backed adapter so 'system' mode follows the device setting."

- [ ] **Step 6: Verify typecheck + the existing buildNativePorts behaviour still holds**

Run: `pnpm --filter @rtc/client-react-native typecheck && pnpm --filter @rtc/client-react-native exec jest src/app/adapters/AppearanceColorSchemeAdapter.test.tsx`
Expected: typecheck PASS; adapter tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/client-react-native/src/app/adapters/AppearanceColorSchemeAdapter.ts \
        packages/client-react-native/src/app/adapters/AppearanceColorSchemeAdapter.test.tsx \
        packages/client-react-native/src/app/buildNativePorts.ts
git commit -m "feat(rn): Appearance-backed colorScheme adapter; wire into buildNativePorts"
```

---

### Task 5: Re-theme the FX / blotter / banner leaves

Convert every hardcoded-hex core leaf to `useThemedStyles(makeStyles)`. Leaves gain no new props; their tests wrap in `renderWithTheme`. `TileGrid` has no colours — leave it untouched.

**Files:**
- Modify: `packages/client-react-native/src/ui/SpotTile.tsx`
- Modify: `packages/client-react-native/src/ui/TradeRow.tsx`
- Modify: `packages/client-react-native/src/ui/TradeTicket.tsx`
- Modify: `packages/client-react-native/src/ui/Blotter.tsx`
- Modify: `packages/client-react-native/src/ui/ConnectionBanner.tsx`
- Test: the co-located `*.test.tsx` for each (wrap in `renderWithTheme`; add colour assertions for SpotTile movement + TradeRow status)

**Interfaces:**
- Consumes: `useThemedStyles` (Task 2), `RnTheme` (Task 1), `renderWithTheme` (Task 2).

- [ ] **Step 1: Rewrite `SpotTile.tsx`** — `styles` and `movementStyle` become theme factories; movement colour resolves via a helper keyed by `movementType`.

```tsx
// packages/client-react-native/src/ui/SpotTile.tsx
import type { JSX } from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CurrencyPair } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { splitPrice } from "#/ui/formatPrice";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { TradeTicket } from "#/ui/TradeTicket";

export function SpotTile({ pair }: SpotTileProps): JSX.Element {
  const { usePrice } = useViewModel();
  const price = usePrice(pair);
  const styles = useThemedStyles(makeStyles);
  const [ticketVisible, setTicketVisible] = useState(false);

  let body: JSX.Element;

  if (price === null) {
    body = (
      <View style={styles.container}>
        <Text style={styles.symbol}>{pair.symbol}</Text>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    );
  } else {
    const ask = splitPrice(price.ask, pair.ratePrecision, pair.pipsPosition);
    body = (
      <View style={styles.container}>
        <Text style={styles.symbol}>{pair.symbol}</Text>
        <View style={styles.row}>
          <Text style={styles.rate}>{ask.prefix}</Text>
          <Text style={movementStyle(styles, price.movementType)}>
            {ask.pips}
          </Text>
          <Text style={styles.rate}>{ask.fractional}</Text>
        </View>
        <Text style={styles.spread}>{price.spread}</Text>
        <Text style={styles.hidden} testID="spot-tile-movement">
          {price.movementType}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        testID="spot-tile"
        onPress={() => {
          setTicketVisible(true);
        }}
      >
        {body}
      </Pressable>
      {ticketVisible ? (
        <TradeTicket
          pair={pair}
          onClose={() => {
            setTicketVisible(false);
          }}
        />
      ) : null}
    </>
  );
}

interface SpotTileProps {
  pair: CurrencyPair;
}

function movementStyle(
  styles: ReturnType<typeof makeStyles>,
  movementType: "NONE" | "UP" | "DOWN",
): { color: string } {
  if (movementType === "UP") {
    return styles.up;
  }
  if (movementType === "DOWN") {
    return styles.down;
  }
  return styles.none;
}

const makeStyles = (t: RnTheme) => {
  return StyleSheet.create({
    container: { padding: 12, backgroundColor: t.bgTile },
    symbol: {
      fontSize: 14,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    row: { flexDirection: "row" },
    rate: { color: t.textPrimary, fontFamily: t.fontMono },
    spread: { fontSize: 11, color: t.textMuted, fontFamily: t.fontMono },
    loading: { fontSize: 12, color: t.textMuted },
    hidden: { display: "none" },
    none: { color: t.textMuted, fontFamily: t.fontMono },
    up: { color: t.accentPositive, fontFamily: t.fontMono },
    down: { color: t.accentNegative, fontFamily: t.fontMono },
  });
};
```

> Note: `CurrencyPrice.movementType` is a `MovementType` union of `"NONE" | "UP" | "DOWN"` (from `@rtc/domain`). If the implementer prefers, import that type instead of the inline union above — but do NOT use an inline object PARAM type for `movementStyle`'s return; the named `{ color: string }` shape is fine as a return annotation (the lint bans inline object *parameter* types, not return types).

- [ ] **Step 2: Update `SpotTile.test.tsx`** — wrap renders in `renderWithTheme`; add a movement→colour assertion against the provided theme (`rnThemeTokens.holo.dark`). Keep all existing structural assertions, replacing bare `render(...)` with `renderWithTheme(...)`. Add:

```tsx
import { rnThemeTokens } from "#/ui/theme/tokens";
// ...
test("paints the ask pips with the movement accent colour", async () => {
  // (use the existing fake ViewModel + price with movementType "UP")
  await renderWithTheme(<SpotTile pair={PAIR} />); // PAIR/fake VM per existing test
  // The pips Text is the sibling carrying the movement colour; assert via its
  // style. Plain <Text> keeps the raw colour string.
  const movement = screen.getByTestId("spot-tile-movement");
  expect(movement).toBeTruthy();
});
```
> The existing `SpotTile.test.tsx` mocks `TradeTicket` (`jest.mock("#/ui/TradeTicket")`) and the ViewModel; preserve that. The colour assertion is best done on a `<Text>` whose `style.color` is deterministic — if extracting the pips node by role is awkward, assert instead that `makeStyles(rnThemeTokens.holo.dark).up.color === rnThemeTokens.holo.dark.accentPositive` in a plain unit test. Either is acceptable; the goal is a discriminating check that movement maps to the accent tokens.

- [ ] **Step 3: Rewrite `TradeRow.tsx`** — `statusStyle` and `styles` become one theme factory; status colour resolves via a helper keyed by `TradeStatus`.

```tsx
// packages/client-react-native/src/ui/TradeRow.tsx
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { type Trade, TradeStatus } from "@rtc/domain";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** One executed-trade row. Status colour maps to the theme's status/accent
 * tokens (pending → aware, done → positive, rejected → negative). */
export function TradeRow({ trade }: TradeRowProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row} testID={`trade-row-${trade.tradeId}`}>
      <Text style={styles.pair}>{trade.currencyPair}</Text>
      <Text style={styles.cell}>{trade.direction}</Text>
      <Text style={styles.cell}>{trade.notional.toLocaleString("en-US")}</Text>
      <Text style={styles.cell}>{trade.spotRate}</Text>
      <Text style={statusStyle(styles, trade.status)}>{trade.status}</Text>
    </View>
  );
}

interface TradeRowProps {
  trade: Trade;
}

function statusStyle(
  styles: ReturnType<typeof makeStyles>,
  status: TradeStatus,
): { color: string } {
  if (status === TradeStatus.Done) {
    return styles.done;
  }
  if (status === TradeStatus.Rejected) {
    return styles.rejected;
  }
  return styles.pending;
}

const makeStyles = (t: RnTheme) => {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: t.bgTile,
    },
    pair: { fontWeight: "600", color: t.textPrimary, fontFamily: t.fontDisplay },
    cell: { color: t.textPrimary, fontFamily: t.fontMono },
    pending: { color: t.accentAware },
    done: { color: t.accentPositive },
    rejected: { color: t.accentNegative },
  });
};
```

- [ ] **Step 4: Update `TradeRow.test.tsx`** — wrap in `renderWithTheme`; assert `getByText(TradeStatus.Done).props.style.color === rnThemeTokens.holo.dark.accentPositive` and the rejected → `accentNegative`. Keep existing structural assertions.

- [ ] **Step 5: Rewrite `TradeTicket.tsx` styles** — keep all logic; convert the module `styles` to `makeStyles(t)`, consumed via `useThemedStyles`. Colour mapping: backdrop → `bgOverlay`; sheet bg → `panel`; input border → `border`; error text → `accentNegative`; buy → tint of `accentPositive` (use `accentPositive` for the button bg with `textOnAccent` label); sell → `accentNegative` bg; disabled → `bgSecondary` + opacity; pair/price text → `textPrimary`. Add `const styles = useThemedStyles(makeStyles);` at the top of the component and change the `const styles = StyleSheet.create(...)` block to:

```tsx
const makeStyles = (t: RnTheme) => {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: t.bgOverlay },
    sheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      padding: 20,
      backgroundColor: t.panel,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
      gap: 12,
    },
    pair: {
      fontSize: 18,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    price: { fontSize: 16, color: t.textPrimary, fontFamily: t.fontMono },
    input: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 6,
      padding: 10,
      color: t.textPrimary,
      fontFamily: t.fontMono,
    },
    error: { color: t.accentNegative },
    buttons: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    sell: {
      flex: 1,
      alignItems: "center",
      padding: 14,
      borderRadius: 6,
      backgroundColor: t.accentNegative,
    },
    buy: {
      flex: 1,
      alignItems: "center",
      padding: 14,
      borderRadius: 6,
      backgroundColor: t.accentPositive,
    },
    disabled: {
      flex: 1,
      alignItems: "center",
      padding: 14,
      borderRadius: 6,
      backgroundColor: t.bgSecondary,
      opacity: 0.5,
    },
    label: { color: t.textOnAccent, fontFamily: t.fontDisplay },
  });
};
```
Add `import type { RnTheme } from "#/ui/theme/tokens";` and `import { useThemedStyles } from "#/ui/theme/useThemedStyles";`. Wrap the Sell/Buy `<Text>` labels in `style={styles.label}`. Keep every `testID`, the Modal, and the settle/auto-close logic byte-for-byte otherwise.

- [ ] **Step 6: Update `TradeTicket.test.tsx`** — wrap all renders in `renderWithTheme`. The existing render is on INITIAL mount (the x86-safe path), so no Modal-on-press concern; just swap `render(...)` → `renderWithTheme(...)` and keep the rest.

- [ ] **Step 7: Rewrite `Blotter.tsx` + `ConnectionBanner.tsx` styles** — same factory conversion.

`Blotter.tsx`: add the theme imports; convert:
```tsx
export function Blotter(): JSX.Element {
  const { useTrades } = useViewModel();
  const trades = useTrades();
  const styles = useThemedStyles(makeStyles);
  // ...unchanged...
}
const makeStyles = (t: RnTheme) => {
  return StyleSheet.create({
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontDisplay },
  });
};
```

`ConnectionBanner.tsx`: add theme imports; give the banner a themed background/border and status-coloured label:
```tsx
export function ConnectionBanner(): JSX.Element {
  const { useConnectionStatus, useReconnect } = useViewModel();
  const status = useConnectionStatus();
  const reconnect = useReconnect();
  const styles = useThemedStyles(makeStyles);
  const showReconnect =
    status !== ConnectionStatus.CONNECTED &&
    status !== ConnectionStatus.CONNECTING;

  return (
    <View style={styles.banner}>
      <Text style={styles.label}>{LABEL[status]}</Text>
      {showReconnect ? (
        <Pressable
          onPress={() => {
            reconnect();
          }}
        >
          <Text style={styles.reconnect}>Reconnect</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
const makeStyles = (t: RnTheme) => {
  return StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: t.bgHeader,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    label: { color: t.textPrimary, fontFamily: t.fontDisplay },
    reconnect: { color: t.accentPrimary, fontFamily: t.fontDisplay },
  });
};
```
Add `import type { RnTheme } from "#/ui/theme/tokens";` and `import { useThemedStyles } from "#/ui/theme/useThemedStyles";` to both files.

- [ ] **Step 8: Update `Blotter.test.tsx` + `ConnectionBanner.test.tsx`** — wrap all renders in `renderWithTheme`; keep existing assertions.

- [ ] **Step 9: Run all Task-5 tests**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/SpotTile.test.tsx src/ui/TradeRow.test.tsx src/ui/TradeTicket.test.tsx src/ui/Blotter.test.tsx src/ui/ConnectionBanner.test.tsx`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/client-react-native/src/ui/SpotTile.tsx \
        packages/client-react-native/src/ui/TradeRow.tsx \
        packages/client-react-native/src/ui/TradeTicket.tsx \
        packages/client-react-native/src/ui/Blotter.tsx \
        packages/client-react-native/src/ui/ConnectionBanner.tsx \
        packages/client-react-native/src/ui/*.test.tsx
git commit -m "feat(rn): theme the FX/blotter/banner leaves via useThemedStyles"
```

---

### Task 6: Re-theme analytics leaves; remove `analytics/colours.ts`

Replace the hardcoded `POSITIVE/NEGATIVE/BASELINE` constants with theme tokens across the five analytics leaves, then delete `colours.ts`. Sign→colour semantics move to `theme.accentPositive/accentNegative` (and `textMuted` for baseline).

**Files:**
- Delete: `packages/client-react-native/src/ui/analytics/colours.ts`
- Modify: `PnlValue.tsx`, `PnlChart.tsx`, `PairPnlBars.tsx`, `ExposureBubbles.tsx`, `AnalyticsScreen.tsx`
- Test: the co-located `*.test.tsx` (wrap in `renderWithTheme`; re-point sign→colour assertions to theme tokens)

**Interfaces:**
- Consumes: `useTheme`/`useThemedStyles` (Task 2), `renderWithTheme` (Task 2), `RnTheme` (Task 1).

- [ ] **Step 1: Rewrite `PnlValue.tsx`** — colour from theme accents:

```tsx
// packages/client-react-native/src/ui/analytics/PnlValue.tsx
import type { JSX } from "react";
import { StyleSheet, Text } from "react-native";

import { formatPnlValue } from "@rtc/domain";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function PnlValue({ value }: PnlValueProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const color = value >= 0 ? styles.pos : styles.neg;
  return (
    <Text testID="pnl-value" style={[styles.value, color]}>
      USD {formatPnlValue(value)}
    </Text>
  );
}

interface PnlValueProps {
  value: number;
}

const makeStyles = (t: RnTheme) => {
  return StyleSheet.create({
    value: { fontSize: 20, fontWeight: "600", fontFamily: t.fontMono },
    pos: { color: t.accentPositive },
    neg: { color: t.accentNegative },
  });
};
```

- [ ] **Step 2: Rewrite `PnlChart.tsx`** — SVG strokes read the theme via `useTheme()` (SVG props take raw strings; no StyleSheet):

```tsx
// packages/client-react-native/src/ui/analytics/PnlChart.tsx
import type { JSX } from "react";
import Svg, { Line, Path } from "react-native-svg";

import type { HistoricPosition } from "@rtc/domain";

import {
  buildChart,
  CHART_HEIGHT,
  CHART_WIDTH,
} from "#/ui/analytics/buildChart";
import { useTheme } from "#/ui/theme/useTheme";

export function PnlChart({ history }: PnlChartProps): JSX.Element {
  const theme = useTheme();
  const { path, zeroY } = buildChart(history);
  const lastValue = history.length > 0 ? history[history.length - 1].usdPnl : 0;
  const stroke = lastValue >= 0 ? theme.accentPositive : theme.accentNegative;

  return (
    <Svg
      width="100%"
      height={CHART_HEIGHT}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      testID="pnl-chart"
    >
      {zeroY !== null ? (
        <Line
          x1={8}
          x2={CHART_WIDTH - 8}
          y1={zeroY}
          y2={zeroY}
          stroke={theme.textMuted}
          strokeWidth={0.5}
          strokeDasharray="4 2"
        />
      ) : null}
      {path !== "" ? (
        <Path
          testID="pnl-chart-path"
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
    </Svg>
  );
}

interface PnlChartProps {
  history: readonly HistoricPosition[];
}
```

- [ ] **Step 3: Rewrite `PairPnlBars.tsx`** — bar/label/centre-line colours from theme:

```tsx
// packages/client-react-native/src/ui/analytics/PairPnlBars.tsx
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { type CurrencyPairPosition, formatWithScale } from "@rtc/domain";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function PairPnlBars({ positions }: PairPnlBarsProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const maxAbsPnl = Math.max(
    ...positions.map((p) => {
      return Math.abs(p.basePnl);
    }),
    1,
  );

  return (
    <View testID="pair-pnl-bars" style={styles.container}>
      {positions.map((pos) => {
        const fraction = Math.abs(pos.basePnl) / maxAbsPnl;
        const positive = pos.basePnl >= 0;
        return (
          <View
            key={pos.symbol}
            testID={`pair-pnl-row-${pos.symbol}`}
            style={styles.row}
          >
            <Text style={styles.symbol}>{pos.symbol}</Text>
            <View style={styles.track}>
              <View style={styles.centerLine} />
              <View
                style={[
                  styles.bar,
                  positive ? styles.barPos : styles.barNeg,
                  { flex: fraction },
                ]}
              />
              <View style={styles.spacer} />
            </View>
            <Text
              testID={`pair-pnl-label-${pos.symbol}`}
              style={positive ? styles.labelPos : styles.labelNeg}
            >
              {formatWithScale(pos.basePnl)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

interface PairPnlBarsProps {
  positions: readonly CurrencyPairPosition[];
}

const makeStyles = (t: RnTheme) => {
  return StyleSheet.create({
    container: { gap: 6 },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    symbol: { width: 64, fontSize: 12, color: t.textSecondary, fontFamily: t.fontMono },
    track: { flex: 1, flexDirection: "row", alignItems: "center", height: 12 },
    centerLine: {
      position: "absolute",
      left: "50%",
      width: 1,
      height: 12,
      backgroundColor: t.textMuted,
    },
    bar: { height: 8 },
    barPos: { backgroundColor: t.accentPositive },
    barNeg: { backgroundColor: t.accentNegative },
    spacer: { flex: 1 },
    labelPos: { width: 56, textAlign: "right", color: t.accentPositive, fontSize: 12, fontFamily: t.fontMono },
    labelNeg: { width: 56, textAlign: "right", color: t.accentNegative, fontSize: 12, fontFamily: t.fontMono },
  });
};
```
> Keep the inline `{ flex: fraction }` — it is a geometry value, not a colour, and follows the existing pattern (the repo's inline-style ban is about static styling; a computed layout fraction has no token). If the lint flags it, extract via `StyleSheet.flatten([...])` is NOT needed — the existing Phase-4 code already ships this exact `{ flex: fraction }` and passes CI.

- [ ] **Step 4: Rewrite `ExposureBubbles.tsx`** — bubble fill from theme accents; label fill from `textOnAccent`:

```tsx
// packages/client-react-native/src/ui/analytics/ExposureBubbles.tsx
import type { JSX } from "react";
import Svg, { Circle, Text as SvgText } from "react-native-svg";

import {
  aggregatePositionsByCurrency,
  type CurrencyPairPosition,
} from "@rtc/domain";

import {
  bubblesHeight,
  computeBubbleLayout,
} from "#/ui/analytics/bubbleLayout";
import { useTheme } from "#/ui/theme/useTheme";

const AREA_WIDTH = 320;

export function ExposureBubbles({
  positions,
}: ExposureBubblesProps): JSX.Element {
  const theme = useTheme();
  const placed = computeBubbleLayout(aggregatePositionsByCurrency(positions), {
    width: AREA_WIDTH,
  });
  const height = bubblesHeight(placed);

  return (
    <Svg
      width="100%"
      height={height}
      viewBox={`0 0 ${AREA_WIDTH} ${height}`}
      preserveAspectRatio="xMidYMin meet"
      testID="exposure-bubbles"
    >
      {placed.map((bubble) => {
        return (
          <Circle
            key={bubble.currency}
            testID={`exposure-bubble-${bubble.currency}`}
            cx={bubble.x}
            cy={bubble.y}
            r={bubble.radius}
            fill={bubble.sign === "pos" ? theme.accentPositive : theme.accentNegative}
            fillOpacity={0.7}
          />
        );
      })}
      {placed.map((bubble) => {
        return (
          <SvgText
            key={`${bubble.currency}-label`}
            x={bubble.x}
            y={bubble.y}
            fontSize={11}
            fill={theme.textOnAccent}
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {bubble.currency}
          </SvgText>
        );
      })}
    </Svg>
  );
}

interface ExposureBubblesProps {
  positions: readonly CurrencyPairPosition[];
}
```

- [ ] **Step 5: Rewrite `AnalyticsScreen.tsx` styles** — panel/section/label/stale colours from theme:

```tsx
// (only the styles block + hook line change; keep all JSX/logic)
export function AnalyticsScreen(): JSX.Element {
  const { useAnalytics, useAnalyticsStaleFlag } = useViewModel();
  const data = useAnalytics();
  const stale = useAnalyticsStaleFlag();
  const styles = useThemedStyles(makeStyles);
  // ...unchanged body...
}
const makeStyles = (t: RnTheme) => {
  return StyleSheet.create({
    panel: { flex: 1, backgroundColor: t.bgPrimary },
    content: { padding: 16, gap: 20 },
    stale: { opacity: 0.5 },
    staleBadge: { alignSelf: "flex-start", fontSize: 11, color: t.accentAware },
    section: { gap: 8 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
    loading: { padding: 16, color: t.textMuted },
  });
};
```
Add `import type { RnTheme } from "#/ui/theme/tokens";` and `import { useThemedStyles } from "#/ui/theme/useThemedStyles";`.

- [ ] **Step 6: Delete `colours.ts`**

```bash
git rm packages/client-react-native/src/ui/analytics/colours.ts
```

- [ ] **Step 7: Update the analytics tests** — wrap every render in `renderWithTheme`; re-point the two sign→colour tests to theme tokens. The `ExposureBubbles.test.tsx` sign→colour test becomes:

```tsx
import { rnThemeTokens } from "#/ui/theme/tokens";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
// remove the `colours` import
const THEME = rnThemeTokens.holo.dark;

test("colours a bubble by the aggregated sign of its net exposure", async () => {
  await renderWithTheme(<ExposureBubbles positions={POSITIONS} />, THEME);
  expect(screen.getByTestId("exposure-bubble-EUR").props.fill).toEqual(
    expect.objectContaining({ payload: processColor(THEME.accentPositive) }),
  );
  expect(screen.getByTestId("exposure-bubble-USD").props.fill).toEqual(
    expect.objectContaining({ payload: processColor(THEME.accentNegative) }),
  );
});
```
Do the equivalent in `PairPnlBars.test.tsx` (label colour is a raw string on a `<Text>`, so assert `screen.getByTestId("pair-pnl-label-EURUSD").props.style` resolves to `THEME.accentPositive` — the label style is `styles.labelPos`, whose `.color` is `THEME.accentPositive`; assert `getByTestId(...).props.style.color === THEME.accentPositive`). Wrap `AnalyticsScreen.test.tsx`, `PnlValue.test.tsx`, `PnlChart.test.tsx` renders in `renderWithTheme` too. For `AnalyticsScreen.test.tsx` the existing `fakeViewModel` supplies `useAnalytics`/`useAnalyticsStaleFlag`; those leaves now also call `useTheme`, so the component tree must be inside a theme context — `renderWithTheme(<ViewModelProvider…><AnalyticsScreen/></ViewModelProvider>)` wraps the whole thing (the theme context and ViewModel context are independent providers).

- [ ] **Step 8: Run all analytics tests**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/analytics`
Expected: PASS. `grep -rn "colours" src/ui/analytics` returns nothing.

- [ ] **Step 9: Commit**

```bash
git add packages/client-react-native/src/ui/analytics
git commit -m "feat(rn): theme the analytics leaves; drop hardcoded colours.ts"
```

---

### Task 7: Appearance tab, `_layout` wiring, font gate, themed tab bar

The 4th tab and the top-level wiring: `ThemeProvider` wraps the tabs, `useAppFonts()` gates first paint, the tab bar + toolbar read the theme, and the new route renders the Appearance screen (mode cycle + skin picker).

**Files:**
- Create: `packages/client-react-native/src/ui/AppearanceScreen.tsx`
- Create: `packages/client-react-native/app/appearance.tsx`
- Modify: `packages/client-react-native/app/_layout.tsx`
- Test: `packages/client-react-native/src/ui/AppearanceScreen.test.tsx`

**Interfaces:**
- Consumes: `useThemePreference()` `{modePreference, cycle}`, `useThemeSkinPreference()` `{skin, setSkin}` (react-bindings); `THEME_SKINS` (domain); `useTheme`/`useThemedStyles` (Task 2); `useAppFonts` (Task 3); `ThemeProvider` (Task 2).

- [ ] **Step 1: Write the failing Appearance screen test**

```tsx
// packages/client-react-native/src/ui/AppearanceScreen.test.tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AppearanceScreen } from "#/ui/AppearanceScreen";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

function fakeViewModel(cycle: () => void, setSkin: (s: string) => void): ViewModel {
  return {
    useThemePreference: () => {
      return { mode: "dark", modePreference: "system", cycle };
    },
    useThemeSkinPreference: () => {
      return { skin: "holo", setSkin };
    },
  } as unknown as ViewModel;
}

function renderScreen(vm: ViewModel): Promise<unknown> {
  return render(
    <ViewModelProvider viewModel={vm}>
      <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
        <AppearanceScreen />
      </ThemeContext.Provider>
    </ViewModelProvider>,
  );
}

test("shows the current mode preference and cycles on press", async () => {
  const cycle = jest.fn();
  await renderScreen(fakeViewModel(cycle, () => {}));
  expect(screen.getByTestId("appearance-mode")).toBeTruthy();
  fireEvent.press(screen.getByTestId("appearance-mode"));
  expect(cycle).toHaveBeenCalledTimes(1);
});

test("selects a skin on press", async () => {
  const setSkin = jest.fn();
  await renderScreen(fakeViewModel(() => {}, setSkin));
  fireEvent.press(screen.getByTestId("appearance-skin-terminal"));
  expect(setSkin).toHaveBeenCalledWith("terminal");
});

test("marks the active skin selected", async () => {
  await renderScreen(fakeViewModel(() => {}, () => {}));
  expect(screen.getByTestId("appearance-skin-holo-active")).toBeTruthy();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/AppearanceScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `AppearanceScreen.tsx`**

```tsx
// packages/client-react-native/src/ui/AppearanceScreen.tsx
import type { JSX } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { THEME_SKINS, type ThemeSkin } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

const MODE_LABEL: Record<string, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

const SKIN_LABEL: Record<ThemeSkin, string> = {
  classic: "Classic",
  holo: "Holo",
  terminal: "Terminal",
  neon: "Neon",
};

/** The Appearance settings screen: a mode row that cycles dark → light →
 * system (reusing the ViewModel's `cycle()`), and a skin list that writes the
 * chosen skin. Both intents live behind the ViewModel; this only renders view
 * state and dispatches. */
export function AppearanceScreen(): JSX.Element {
  const { useThemePreference, useThemeSkinPreference } = useViewModel();
  const { modePreference, cycle } = useThemePreference();
  const { skin, setSkin } = useThemeSkinPreference();
  const styles = useThemedStyles(makeStyles);

  return (
    <ScrollView
      testID="appearance-panel"
      style={styles.panel}
      contentContainerStyle={styles.content}
    >
      <View style={styles.section}>
        <Text style={styles.label}>Mode</Text>
        <Pressable
          testID="appearance-mode"
          style={styles.modeRow}
          onPress={() => {
            cycle();
          }}
        >
          <Text style={styles.modeValue}>{MODE_LABEL[modePreference]}</Text>
          <Text style={styles.modeHint}>Tap to change</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Skin</Text>
        {THEME_SKINS.map((s) => {
          const active = s === skin;
          return (
            <Pressable
              key={s}
              testID={
                active ? `appearance-skin-${s}-active` : `appearance-skin-${s}`
              }
              style={active ? styles.skinRowActive : styles.skinRow}
              onPress={() => {
                setSkin(s);
              }}
            >
              <Text style={styles.skinName}>{SKIN_LABEL[s]}</Text>
              {active ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const makeStyles = (t: RnTheme) => {
  return StyleSheet.create({
    panel: { flex: 1, backgroundColor: t.bgPrimary },
    content: { padding: 16, gap: 24 },
    section: { gap: 8 },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
    modeRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 14,
      borderRadius: 8,
      backgroundColor: t.panel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    modeValue: { fontSize: 16, color: t.textPrimary, fontFamily: t.fontDisplay },
    modeHint: { fontSize: 12, color: t.textMuted },
    skinRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 14,
      borderRadius: 8,
      backgroundColor: t.panel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    skinRowActive: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 14,
      borderRadius: 8,
      backgroundColor: t.panel,
      borderWidth: 1,
      borderColor: t.borderStrong,
    },
    skinName: { fontSize: 16, color: t.textPrimary, fontFamily: t.fontDisplay },
    check: { fontSize: 16, color: t.accentPrimary },
  });
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/AppearanceScreen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `app/appearance.tsx`** (route — default export required)

```tsx
// packages/client-react-native/app/appearance.tsx
import type { JSX } from "react";

import { AppearanceScreen } from "#/ui/AppearanceScreen";

export default function AppearanceRoute(): JSX.Element {
  return <AppearanceScreen />;
}
```

- [ ] **Step 6: Rewrite `app/_layout.tsx`** — wrap the tabs in `ThemeProvider` (inside `AppRoot`, which supplies the ViewModel), gate first paint on `useAppFonts()`, theme the toolbar + tab bar via an inner `useTheme()` component, and add the 4th `Tabs.Screen`.

```tsx
// packages/client-react-native/app/_layout.tsx
import { Tabs } from "expo-router";
import type { JSX } from "react";
import { useState } from "react";
import { SafeAreaView, StyleSheet, Switch, Text, View } from "react-native";

import { AppRoot } from "#/app/AppRoot";
import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { useAppFonts } from "#/ui/theme/fonts";
import { ThemeProvider } from "#/ui/theme/ThemeProvider";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Root layout: owns the simulator/live toggle, wraps the tab navigator in one
 * `AppRoot` (one composition, one WS, one blotter presenter) and one
 * `ThemeProvider` (one resolved skin×mode shared by every tab). First paint is
 * gated on the bundled fonts so no leaf renders a not-yet-loaded family. */
export default function RootLayout(): JSX.Element {
  const [simulator, setSimulator] = useState(false);
  const fontsLoaded = useAppFonts();

  if (!fontsLoaded) {
    return <SafeAreaView style={styles.screen} testID="fonts-loading" />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <AppRoot key={simulator ? "sim" : "live"} simulator={simulator}>
        <ThemeProvider>
          <Chrome simulator={simulator} onToggle={setSimulator} />
        </ThemeProvider>
      </AppRoot>
    </SafeAreaView>
  );
}

/** Themed shell inside the providers — reads the theme for the toolbar and tab
 * bar and renders the connection banner + tab navigator. */
function Chrome({ simulator, onToggle }: ChromeProps): JSX.Element {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.fill}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarLabel}>Simulator</Text>
        <Switch value={simulator} onValueChange={onToggle} />
      </View>
      <ConnectionBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: theme.bgPrimary },
          tabBarStyle: {
            backgroundColor: theme.bgHeader,
            borderTopColor: theme.borderSubtle,
          },
          tabBarActiveTintColor: theme.accentPrimary,
          tabBarInactiveTintColor: theme.textMuted,
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Rates" }} />
        <Tabs.Screen name="blotter" options={{ title: "Blotter" }} />
        <Tabs.Screen name="analytics" options={{ title: "Analytics" }} />
        <Tabs.Screen name="appearance" options={{ title: "Appearance" }} />
      </Tabs>
    </View>
  );
}

interface ChromeProps {
  simulator: boolean;
  onToggle: (value: boolean) => void;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});

const makeStyles = (t: RnTheme) => {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.bgPrimary },
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: t.bgHeader,
    },
    toolbarLabel: { color: t.textPrimary, fontFamily: t.fontDisplay },
  });
};
```
> `sceneStyle` is the expo-router/RN-tabs prop for the content background (SDK 55). If typecheck rejects `sceneStyle`, drop that one line — the per-screen backgrounds already come from each screen's themed root — and keep `tabBarStyle`/tint colours.

- [ ] **Step 7: Verify typecheck + the whole RN suite**

Run: `pnpm --filter @rtc/client-react-native typecheck && pnpm --filter @rtc/client-react-native test`
Expected: typecheck PASS; vitest + jest all green.

- [ ] **Step 8: Commit**

```bash
git add packages/client-react-native/src/ui/AppearanceScreen.tsx \
        packages/client-react-native/src/ui/AppearanceScreen.test.tsx \
        packages/client-react-native/app/appearance.tsx \
        packages/client-react-native/app/_layout.tsx
git commit -m "feat(rn): Appearance tab + themed _layout with font gate"
```

---

## Final Verification (controller runs first-hand, real exit codes)

Run from the worktree root. Every gate must be green before the branch ships.

```bash
# Package gauntlet
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test           # vitest + jest
pnpm build                                             # topo build (dist for libs)

# CI-parity lints beyond Biome (Biome-clean ≠ CI-clean)
pnpm exec biome ci packages/client-react-native
pnpm exec eslint .
pnpm exec eslint . --config eslint.config.typed.mjs
pnpm run lint:css                                      # stylelint (no-op for RN, must pass repo-wide)

# Repo-scope gates that bit earlier phases
pnpm exec knip
pnpm exec syncpack list-mismatches                     # or the repo's check:versions script

# Bundle smoke — proves Metro resolves the new deps + fonts end-to-end
cd packages/client-react-native && npx expo export --platform ios --output-dir dist && cd -
```
Expected: all exit 0; `expo export` reports a module count ≥ the Phase-4 baseline of 1705 (fonts + theme add modules).

---

## Self-Review notes (author)

- **Spec coverage:** §2 architecture → all tasks; §3 flattening → Task 1 (FX keys omitted); §4 token store → Task 1; §5 provider/useThemedStyles → Task 2; §6 fonts → Task 3; §7 Appearance tab + cycle() → Task 7; §8 colorScheme adapter → Task 4; §9 leaf re-theming + remove colours.ts → Tasks 5–6; §10 testing → each task's tests + Final Verification; §11 non-goals → nothing here touches aurora/blur/glow/boot/e2e; §12 constraints → Global Constraints block.
- **Type consistency:** `RnTheme` keys used in Tasks 5–7 all exist in Task 1's interface; `useThemedStyles`/`useTheme`/`renderWithTheme`/`ThemeContext` signatures match Task 2; `useAppFonts` matches Task 3; `AppearanceColorSchemeAdapter` matches Task 4; `cycle`/`modePreference`/`setSkin`/`skin` match the react-bindings hook result types (verified against `createViewModel.ts`).
- **No react-native import in `tokens.ts`/`fontFamilies.ts`** (vitest-safe) — enforced by Global Constraints and the vitest test location.
