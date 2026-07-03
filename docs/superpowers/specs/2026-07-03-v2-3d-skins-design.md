# v2 3D Skins (holo3d + terminal3d) — Design

**Date:** 2026-07-03
**Status:** Approved (brainstormed with user; follows the v2-fidelity flagship slice
`2026-07-02-v2-fidelity-flagship-fx-design.md` and its merged follow-ups, PR #88 + #94)

## 1. Goal

Grow the theme-skin catalogue from 4 to 6 by adding the v2 prototype's two depth
skins, `holo3d` and `terminal3d`, in dark **and** light modes — and in doing so
prove the ADR invariant *"adding a skin = one token entry per client"* end to end.

- **client-react** renders both skins pixel-faithful to the prototype.
- **client-react-native** renders them as their flat siblings via a typed token
  alias (real mobile depth styling is a future mobile-3d phase).
- **client-prototype** is untouched (it has its own self-contained theme copy;
  parity is that package's own workstream).

## 2. Scope

**In:** domain `THEME_SKINS` extension; four verbatim `ThemeTokens` entries +
two `SKIN_LABEL` entries in client-react; RN label + token-alias entries; test
updates (domain, tokens invariants, ThemePicker contract, RN AppearanceScreen);
acceptance screenshots.

**Out:** RN depth styling (iOS `shadow*` / Android `elevation` design); any
component/CSS change (none is needed — the consumers already exist);
client-prototype parity; visual-golden growth (goldens pin `classic` only);
preferences-catalogue parity; downgrade handling for persisted `"holo3d"` read
by an older build (predates this phase's concern, consistent with v1→v2 skins).

## 3. Pixel source of truth

`docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html` (PROTO):

| Entry | PROTO source |
|---|---|
| holo3d dark | `themes.holo3d`, L772 |
| terminal3d dark | `themes.terminal3d`, L774 |
| holo3d light | `themesLight.holo3d`, L779 |
| terminal3d light | `themesLight.terminal3d`, L781 |
| Picker labels | `themeNames`, L1406: `holo3d:'Holo HUD 3D'`, `terminal3d:'Terminal 3D'` |

Values are translated **verbatim** — never eyeballed or derived — exactly as the
flat skins' light variants were in the flagship slice.

## 4. Domain change (`@rtc/domain`)

Two edits in `src/preferences/preferences.ts`, keeping their existing shapes
(`ThemeSkin` is a hand-written union at L19; `THEME_SKINS` is a
`readonly ThemeSkin[]` at L32 — it does **not** derive from the union, so both
must change together):

```ts
export type ThemeSkin =
  | "classic"
  | "holo"
  | "holo3d"
  | "terminal"
  | "terminal3d"
  | "neon";

export const THEME_SKINS: readonly ThemeSkin[] = [
  "classic",
  "holo",
  "holo3d",
  "terminal",
  "terminal3d",
  "neon",
];
```

Order: siblings adjacent, matching the PROTO picker; `classic` stays first as
the app-only legacy skin. No persistence migration: skins persist as strings
and the change is purely additive, so every previously stored value remains
valid.

TypeScript's exhaustive `Record<ThemeSkin, …>` types in both clients
(client-react `SKIN_LABEL` + `themeTokens`, RN `SKIN_LABEL` + token store) turn
this widening into compile errors until every consumer handles the new skins —
that typecheck ripple **is** the completeness mechanism; no runtime guards are
added.

## 5. client-react tokens (the heart)

Four new `ThemeTokens` entries in `ui/shell/theme/tokens.ts`: `holo3dDark`,
`holo3dLight`, `terminal3dDark`, `terminal3dLight`, wired into `themeTokens`.

**Derivation rule:** each entry is built with the *same key-mapping its flat
sibling used* (see the `holoDark`/`terminalDark` entries and their comments),
substituting the 3d PROTO row's values:

- Direct: `bg→--bg-primary`, `bg2→--bg-secondary/--bg-header/--bg-footer`,
  `text/dim/faint→--text-primary/secondary/muted`, `accent→--accent-primary` +
  `--bg-brand-primary`, `accent2→--accent-2`, `buy/sell→--accent-positive/negative`
  + `--status-connected/disconnected` (+`--status-error` from sell),
  `border/borderStrong→--border-primary/--border-strong`, `glow→--glow`,
  `grid→--grid`, `chip→--chip`, `panel→--panel` + `--bg-tile`,
  `panelHead→--panel-head`, `auroraOp→--aurora-opacity`,
  `tile→--tile`, `tileShadow→--tile-shadow`, `panelShadow→--panel-shadow`,
  `fontD/fontM→--font-display/--font-mono`.
- Derived, same as sibling: `--border-subtle`/`--border` (sibling's derivation
  from the border colour), `--text-on-accent` (= bg-primary for dark, stays
  light-on-accent for light — copy the sibling's choice), `--accent-aware` and
  `--status-connecting` (sibling's amber), `--aurora-a/b` (accent/accent2 at the
  sibling's opacities), `--bg-overlay` (sibling's darkened bg),
  `--font-logo` (`'Orbitron', sans-serif`).
- Inherited from sibling, not in PROTO row: `--panel-blur` (holo3d = holo's
  `14px`/light value; terminal3d = terminal's `0`).

What makes these entries "3d" rather than copies of their siblings: gradient
`panel`/`panelHead` fills, heavier layered `--tile-shadow`, and — for the first
time in the store — a real `--panel-shadow` (multi-layer drop shadow + inset
highlight) instead of `"none"`.

**No component or CSS-module changes.** `Tile.module.css` already applies
`box-shadow: var(--tile-shadow)` and `InhouseLayoutEngine.module.css` applies
`box-shadow: var(--panel-shadow)`; the flagship slice put the schema and
consumers in place precisely so this phase is token-only.

`ThemePicker.tsx` `SKIN_LABEL` gains `holo3d: "Holo HUD 3D"` and
`terminal3d: "Terminal 3D"` (PROTO L1406 verbatim).

## 6. React Native alias (`@rtc/client-react-native`)

- `ui/AppearanceScreen.tsx` `SKIN_LABEL` gains the same two labels.
- The RN token store (`src/ui/theme/tokens.ts`) maps each 3d skin to its flat
  sibling's theme object by reference (`holo3d: <holo entry>`,
  `terminal3d: <terminal entry>`), each with a comment naming the future
  mobile-3d phase.

Mobile users can select the new skins and get a sensible flat rendering — the
picker never lies about what a skin *is*, only renders it without depth.

## 7. Testing

- **Domain:** `preferences.test.ts` expects the new 6-entry list (order above).
- **tokens.test.ts:**
  - The existing v2 dark-skin invariant loop (gradient `--tile`, inset
    `--tile-shadow`) extends to `holo3d`/`terminal3d`.
  - New invariant pinning the flat/3d distinction, both modes: 3d skins have a
    non-`"none"` `--panel-shadow` containing `inset`; `holo`/`terminal`/`neon`/
    `classic` keep `--panel-shadow: "none"`.
  - Existing schema-completeness checks pick the new entries up automatically.
- **ThemePicker contract spec:** menu lists 6 skins with the labels above;
  selecting a 3d skin updates the selection (same shape as existing cases).
- **RN AppearanceScreen test:** row count/labels updated for 6 skins.
- **Acceptance (the faithfulness gate):** screenshots of the running app in
  holo3d and terminal3d, dark and light, side-by-side against the PROTO's same
  themes, delivered for the user's eyeball — exactly like the flagship slice's
  task-10 acceptance. Visual goldens are untouched (they pin `classic` plus
  app-level light/system).

## 8. Risks

None structural — the change is additive at every layer, enforcement is by
typecheck, and rendering risk is bounded by the acceptance-screenshot gate.
The known non-risk worth restating: goldens cannot flake from this phase
because no golden fixture selects a 3d skin.
