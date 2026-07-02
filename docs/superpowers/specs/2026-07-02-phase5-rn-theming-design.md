# Phase 5 — React Native Theming (skin × mode) · Design

**Status:** Approved (2026-07-02)
**Workstream:** `@rtc/client-react-native` (RN/Expo client) — Phase 5
**Predecessor:** Phase 4 (analytics/P&L, PR #85 `09630cd4`)
**Spec home:** this file · **Roadmap line:** `docs/superpowers/specs/2026-06-29-react-native-expo-client-design.md` §Phasing ("theming (skin × mode)")

---

## 1. Goal

Bring the web client's four-skin × light/dark theming to the React Native client,
so a colleague can switch skin (`classic` / `holo` / `terminal` / `neon`) and mode
(`dark` / `light` / `system`) on the phone and see every leaf re-paint. This is the
mobile realisation of a capability already proven on the web, and — because the
theme *state* is entirely framework-neutral — it is a showcase of the clean-arch
reuse seam: the RN app inherits the whole theme brain and supplies only the paint.

## 2. Architecture — a pure View phase

The theme **state machine already exists and is framework-neutral**. Phase 5 adds
**only the RN paint layer**. No changes to `domain`, `client-core`, or
`react-bindings` (the mode control deliberately reuses the existing `cycle()`
intent — see §7 — so `react-bindings` stays untouched).

```
domain          ThemeSkin×ThemeMode · resolveThemeMode · nextThemeModePreference   REUSED
client-core     ThemePreferencePresenter · ThemeSkinPreferencePresenter ·
                ColorSchemeSource port                                              REUSED
react-bindings  useThemePreference() {mode, modePreference, cycle} ·
                useThemeSkinPreference() {skin, setSkin}                            REUSED
RN AsyncStorage AsyncStoragePreferencesAdapter already persists themeMode+themeSkin REUSED
──────────────────────────────────────────────────────────────────────────────────
RN (NEW)        RnTheme token store · ThemeProvider/useTheme/useThemedStyles ·
                themed leaves · Appearance tab · OS colorScheme adapter · fonts
```

This mirrors how the web paints. The web's `ThemeProvider` reads the same two
hooks and writes 35 CSS custom properties onto `document.documentElement` for the
resolved `themeTokens[skin][mode]` cell. RN cannot use CSS variables, `var()`,
`backdrop-filter`, or box-shadow strings, so it resolves the same `skin×mode` cell
into a plain JS `RnTheme` object and passes it down through React context. **The
web token file and web `ThemeProvider` are untouched** — painting is a per-render-
target concern, exactly the layer the architecture expects each target to own.

## 3. Skin scope — all four skins, FX flattened

All four skins carry their full **colour + font identity** in both modes. The
web's skin-specific **effects are flattened** for mobile (and stay flattened —
the animated/glass FX belong to the later deferred animation phase):

| Web token(s)                       | RN treatment                                            |
| ---------------------------------- | ------------------------------------------------------- |
| `--aurora-a/-b/-opacity`           | **Dropped** — animated background is the animation phase |
| `--panel-blur` (`14px`/`12px`)     | **Dropped** — translucent solid fill via the existing rgba `--panel` values |
| `--glow` (box-shadow string)       | **Dropped** — no glow shadow on mobile leaves           |
| `--grid` (faint HUD line)          | **Dropped** — no HUD grid lines on mobile               |
| `--font-display` / `--font-mono`   | Mapped to bundled font-family names (§6)                |
| `var(--x)` references (e.g. `--panel: var(--bg-tile)`) | **Resolved to concrete values** per cell |

## 4. Token store — `src/ui/theme/tokens.ts`

Defines the `RnTheme` interface — the plain-colour subset of the web's 35 keys,
camelCased, all `var()` refs pre-resolved, all FX keys dropped:

```
RnTheme keys (29):
  Backgrounds  bgPrimary bgSecondary bgHeader bgFooter bgTile bgOverlay bgBrandPrimary
  Text         textPrimary textSecondary textMuted textOnAccent
  Accents      accentPositive accentNegative accentAware accentPrimary accent2
  Borders      borderPrimary borderSubtle border borderStrong
  Status       statusConnected statusConnecting statusDisconnected statusError
  Panel/chip   panel panelHead chip
  Fonts        fontDisplay fontMono
```

Exported as `rnThemeTokens: Record<ThemeSkin, Record<ThemeMode, RnTheme>>` — the
RN analogue of the web's `themeTokens`. Colour VALUES are transcribed 1-to-1 from
the web `tokens.ts` cells (they are already RN-valid `#hex` / `rgba(...)` strings);
`panel`/`panelHead` resolve their `var()` targets; `fontDisplay`/`fontMono` hold
the bundled family-name strings from §6.

## 5. Provider, context, and the themed-styles pattern

```
src/ui/theme/
  tokens.ts          RnTheme + rnThemeTokens
  ThemeContext.ts    React.createContext<RnTheme | null>
  ThemeProvider.tsx  reads useThemePreference()+useThemeSkinPreference(),
                     resolves rnThemeTokens[skin][mode], provides it
  useTheme.ts        context consumer; throws outside a ThemeProvider
  useThemedStyles.ts (make: (t: RnTheme) => T) => useMemo(() => make(theme), [theme])
```

`ThemeProvider` sits **inside `AppRoot`** (it depends on the ViewModel hooks),
wrapping the `<Tabs>` tree. It subscribes to `useThemePreference()` (the resolved
`mode`) and `useThemeSkinPreference()` (`skin`), looks up
`rnThemeTokens[skin][mode]`, and supplies it. A small inner component reads
`useTheme()` to build the themed `<Tabs screenOptions>` (active/inactive tint,
tab-bar background/border).

**Leaf pattern — avoids the repo's inline-style-object lint.** Each themed leaf
keeps a `StyleSheet.create`, but via a factory:

```ts
const makeStyles = (t: RnTheme) => StyleSheet.create({
  tile: { backgroundColor: t.bgTile, borderColor: t.borderSubtle },
  price: { color: t.textPrimary, fontFamily: t.fontMono },
});
// in the component:
const styles = useThemedStyles(makeStyles);
```

Styles stay inside `StyleSheet.create`, JSX keeps referencing `styles.x` (no inline
`{…}` style literals → no `no-restricted-syntax` violation), and styles recompute
only when the theme object identity changes.

## 6. Fonts — bundled via `@expo-google-fonts` (Expo-Go-safe)

Real skin typography via `@expo-google-fonts/*` + `expo-font` — no `.ttf` files to
vendor, all Expo-Go-compatible:

| Skin              | Display          | Mono              | Source packages                                   |
| ----------------- | ---------------- | ----------------- | ------------------------------------------------- |
| `holo`, `neon`    | Chakra Petch     | JetBrains Mono    | `@expo-google-fonts/chakra-petch`, `.../jetbrains-mono` |
| `terminal`        | IBM Plex Sans    | IBM Plex Mono     | `@expo-google-fonts/ibm-plex-sans`, `.../ibm-plex-mono` |
| `classic`         | System (default) | platform monospace | none (RN default `fontFamily` + `Platform.select`) |

`src/ui/theme/fonts.ts` exports the family-name constants (the names
`@expo-google-fonts` register) and a `useAppFonts()` hook wrapping the
`useFonts([...])` loaders. `_layout.tsx` (inside `AppRoot`) calls `useAppFonts()`
and gates first paint on the loaded flag with a themed full-screen loading `View`
(no `expo-splash-screen` dependency). `classic` needs no bundled font, so its cells
use `undefined` (RN System) for `fontDisplay` and `Platform.select({ ios: "Menlo",
android: "monospace", default: "monospace" })` for `fontMono`.

## 7. Appearance tab & controls

New 4th bottom tab (`Rates | Blotter | Analytics | Appearance`):

```
app/appearance.tsx        default-export route → <AppearanceScreen/>
src/ui/AppearanceScreen.tsx  the screen + small ModeToggle / SkinPicker leaves
```

- **Mode control** — reuses the existing `useThemePreference().cycle()`
  (`dark → light → system → dark`), rendered as a single tappable row that shows
  the current `modePreference`. This is faithful to the web header's `ThemeToggle`
  and requires **zero `react-bindings` change**. (A 3-way segmented control was
  considered and rejected: it would require exposing `setMode` on the hook,
  widening the change past the pure-RN boundary for marginal UX gain.)
- **Skin control** — `useThemeSkinPreference().setSkin(skin)`, rendered as a list
  of the four `THEME_SKINS` with the current one marked selected.

Every control paints through `useTheme()` like any other leaf.

## 8. OS colorScheme adapter — `src/app/adapters/AppearanceColorSchemeAdapter.ts`

Implements `ColorSchemeSource.prefersDark$(): Observable<boolean>` via RN's
`Appearance` API (Expo-Go-safe): a `BehaviorSubject` seeded from
`Appearance.getColorScheme() === "dark"`, updated by `Appearance.addChangeListener`,
and torn down on unsubscribe. It is the RN analogue of the web's
`MediaQueryColorSchemeAdapter`. Wired into **both** branches of
`buildNativePorts` so `"system"` mode follows the device setting live — this closes
the Phase-0 deferred minor ("make colorScheme required so a future RN/Solid
composition can't silently lose dark-mode").

## 9. Leaf re-theming surface

Every leaf that currently hardcodes hex is converted to `useThemedStyles`:
`SpotTile`, `TileGrid`, `TradeRow`, `TradeTicket`, `Blotter`, `ConnectionBanner`,
and the five analytics leaves (`PnlValue`, `PnlChart`, `PairPnlBars`,
`ExposureBubbles`, `AnalyticsScreen`). Plus `_layout.tsx` (tab bar + toolbar).

The Phase-4 `src/ui/analytics/colours.ts` (`POSITIVE`/`NEGATIVE`/`BASELINE`) is
**removed**; profit/loss/baseline colours now come from `theme.accentPositive` /
`theme.accentNegative` / `theme.textMuted`. `SpotTile`'s movement colours (up
`#3fb68b` / down `#e05252` / none `#c8c8c8`) map to the same three tokens. The
Phase-4 sign→colour assertions are re-pointed at the theme values (still
discriminating: a swapped token would invert profit/loss and fail).

**react-native-svg note (banked lesson):** the analytics SVG leaves pass theme
colours to `<Circle fill>` / `<Path stroke>`. Under jest these render as
`processColor`'d objects, so colour assertions use
`expect.objectContaining({ payload: processColor(theme.accentPositive) })`, not raw
string equality.

## 10. Testing

- **vitest** (`.test.ts`): `tokens.ts` — every `skin×mode` cell defines all
  `RnTheme` keys, no value contains the literal `var(`, every colour is a valid
  `#hex`/`rgba()` string; `useThemedStyles` recomputes on theme change and memoises
  otherwise.
- **jest-expo** (`.test.tsx`): `ThemeProvider` + `useTheme` (a given `skin×mode`
  yields the correct token cell; `useTheme` throws outside a provider);
  `AppearanceScreen` (tapping the mode row calls `cycle()`; selecting a skin calls
  `setSkin`); a themed-leaf smoke test (a leaf paints `theme.bgTile`);
  `AppearanceColorSchemeAdapter` (mock `Appearance` → `prefersDark$` emits current +
  reacts to change events + unsubscribes cleanly). The adapter test is jest-expo,
  not vitest, because it imports `react-native` (vitest cannot parse RN's Flow
  source).
- Existing leaf/analytics tests keep passing after re-theming (they assert
  testIDs/text/structure; the sign→colour ones re-point to theme tokens).

## 11. Non-goals (explicitly deferred)

- Aurora animated backgrounds, `motion` / `react-native-reanimated` — the animation
  phase.
- `expo-blur` glass panels / real backdrop blur.
- Boot / lock shell chrome (its own later phase).
- Maestro/gherkin RN e2e and RN visual baseline set (their own dedicated phase).
- Any `domain` / `client-core` / `react-bindings` / web change (the mode control
  reuses `cycle()` precisely to hold this line).

## 12. Global constraints (carried into the plan)

- **Expo SDK 55**, RN 0.83, Expo Go-compatible — no custom native modules; every
  new dep (`expo-font`, `@expo-google-fonts/*`) must be Expo-Go-safe.
- Add native modules with `expo install` (SDK-pinned exact version, no caret) —
  same rule that pinned `react-native-svg@15.15.3`.
- `react-native-svg` stays in the jest `transformIgnorePatterns` allowlist; any new
  package that ships untranspiled ESM and is imported by a jest-tested file must be
  added too.
- Test island: `.test.ts` → vitest (needs explicit `#/` `resolve.alias` and explicit
  `import { expect, test } from "vitest"`); `.test.tsx` → jest-expo (RNTL 14, async
  `render`, `@jest/globals`). RN `test` script runs both.
- Full CI gauntlet beyond Biome: `eslint .` **and** `eslint . --config
  eslint.config.typed.mjs`, stylelint, knip, syncpack, `expo export` smoke — the
  controller re-verifies every gate first-hand with real exit codes.
- No inline `style={{…}}` object literals and no inline object PARAM types (use the
  `makeStyles` factory and named RN types).
- Expo Router routes need a default export (scoped Biome `noDefaultExport:off` for
  `app/**` already configured).
