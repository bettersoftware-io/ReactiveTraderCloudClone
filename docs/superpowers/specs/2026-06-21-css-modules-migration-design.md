# CSS Modules Migration — Design

**Date:** 2026-06-21
**Status:** Approved (design)
**Scope:** `@rtc/client-react` only

## Problem

Every React component styles itself with the inline `style` prop. There are
**191 inline `style={{…}}` blocks across 45 of 47 component files**, zero
`className` usages, and zero `.css` files. Theming is already correct — design
tokens (`shell/theme/tokens.ts`) are painted as CSS custom properties on `:root`
by `ThemeProvider`, and components already reference them as `var(--token)`
*inside* the inline styles.

Inline styles have three costs here:

1. **No portability story.** The repo is preparing to add a SolidJS UI layer
   (and possibly React Native). Inline style objects are React-idiomatic; a
   `class` string ports verbatim to Solid/Vue/Svelte, a JS style object does not.
2. **No pseudo-selectors.** `:hover`, `:focus`, media queries, keyframes, and
   `::before`/`::after` are impossible inline; any such behavior is missing or
   faked in JS.
3. **Re-created every render.** 191 object literals are rebuilt on each render
   instead of being static CSS rules.

The theme layer is *not* the problem — only the delivery mechanism for the rest
of the styles.

## Decision

Adopt **CSS Modules** (`*.module.css`), co-located per component. Chosen over
Tailwind, vanilla-extract, and plain global CSS, and decisively over runtime
CSS-in-JS (styled-components / Emotion).

Rationale:

- **Zero runtime**, Vite-native, scoped by default.
- Emits plain `class` strings → **ports verbatim** to the planned SolidJS layer.
  This is the project's north star ("make choices, defer commitment"; swap a
  framework by changing only its package).
- Keeps the existing `var(--token)` theme **untouched**.
- No new typing wiring: `src/vite-env.d.ts` already references `vite/client`, so
  `*.module.css` imports type as `Record<string, string>`.
- Runtime CSS-in-JS is explicitly rejected: it is React-coupled (won't port to
  Solid) and carries runtime overhead — the wrong fit for a trading UI and for
  the portability goal.

Migration covers **all 45 files in one workstream**, internally sequenced to
de-risk (see §6).

## The three style categories

The 191 inline styles are not uniform. They map to three mechanisms:

| Category | Examples | Target mechanism |
|---|---|---|
| **Static** (~85%) | `padding: 12`, `border: 1px solid var(--border-primary)`, `display: flex` | Static class in the co-located `*.module.css`. **`var(--token)` references are copied verbatim.** |
| **Boolean / enum state** | `opacity: isLoading ? 0.5 : 1`; active tab `fontWeight: 600`; price direction up/down color; disabled inputs | A semantic **`data-*` attribute** on the element + a CSS **attribute selector** (`[data-loading="true"]`, `[data-direction="up"]`, `[data-active="true"]`). |
| **Continuous data-driven geometry** | `width: ${fraction*100}%` (`RfqCountdown`), `${Math.abs(fraction)*50}%` (`PairPnlBars`), bubble position/size (`PositionBubbles`) | An **inline CSS custom property** — `style={{ "--fill": … }}` — consumed by the class (`width: var(--fill)`). This is the *only* legitimate surviving `style` prop. |

SVG charts (`TileChart`, `PnlChart`) drive geometry through SVG attributes
(`viewBox`, path `d`), not CSS — **left untouched**.

## Architecture

### File layout
- One `Foo.module.css` co-located beside each `Foo.tsx` that carries styles
  (~45 files).
- New `src/index.css` holding the global reset, imported once at the top of
  `src/main.tsx`. This **replaces** the imperative
  `document.createElement("style")` block (current `main.tsx` lines 9–26).
- `ThemeProvider`'s `:root` token painting **stays as-is** — applying a theme to
  the document is rendering (the View's job) and is already portable.

### Conventions
- **camelCase class keys** (`styles.tileContainer`) for clean JS member access.
- State is expressed as **semantic `data-*` attributes**, not conditional class
  juggling, wherever a boolean/enum drives appearance. Prefer ARIA where one fits
  (`aria-current`, `aria-pressed`, `aria-disabled`) and add a `data-*` mirror
  only when needed for styling/testing.
- **No new dependencies**: no CSS-in-JS, no Tailwind, no `clsx`. If a handful of
  call sites genuinely need to join classes, add a tiny local `cx()` helper —
  but data-attributes should remove most of that need.
- **No TS wiring**: rely on `vite/client`'s ambient `*.module.css` typing.

## Contract-tier migration (critical workstream)

The framework-neutral **contract test tier** currently sniffs **inline styles**
to infer state. ~15+ assertions across the Page Objects read `element.style.*`,
e.g.:

- `btn.style.fontWeight === "600"` — active tab/filter
  (`RfqFilterTabsPage`, `CurrencyFilterPage`, `HeaderPage`)
- `row.style.textDecoration === "line-through"`, `row.style.backgroundColor`
  (`BlotterRowPage`)
- `span.style.fontWeight === "700"`, `span.style.color` (`TilePricePage`)
- `overlay.style.backgroundColor`, `.style.cursor` (`TileConfirmationPage`)
- `fill.style.width.endsWith("%")`, `.style.backgroundColor` (`RfqCountdownPage`)
- `span.style.position === "absolute"` (`TilePage`),
  `input.style.borderBottom` (`TileNotionalPage`)

Once styles move into a `.module.css` class, `element.style.X` returns `""` in
jsdom (stylesheet rules are not reflected onto the inline `style` object). A
naive migration would **silently break the contract tier** — the exact suite
meant to guarantee a clean SolidJS swap.

This is also a latent test smell: asserting on *presentation* (`fontWeight: 600`)
to detect *state* (active) was always fragile. The fix rides along with the
migration:

- Replace each `element.style.*` sniff with the matching **semantic signal** the
  new markup exposes:
  - active tab/filter → `el.dataset.active === "true"` (or `aria-current` /
    `aria-pressed`)
  - settled/done trade row → `el.dataset.settled` / `data-state`
  - price direction → `el.dataset.direction`
  - countdown/bars → `el.style.getPropertyValue("--fill")` (the custom property
    *is* still readable on the inline `style` object)

This keeps the contract tier green **and** makes it a stronger, more
framework-neutral portability contract (a SolidJS port sets the same `data-*`
but may style "active" differently — asserting `fontWeight` was always brittle).

## Correctness oracle

This is a **behavior-preserving 1:1 migration**. Proof of fidelity:

- **Visual goldens are the oracle.** Three tiers, both committed sets (CI
  `react/` x86 + local `react-local/<arch>`). Because pixels must not change, the
  goldens must **NOT** move and **must not be regenerated** — an unexpected pixel
  diff *is* a migration bug. Real-browser pixel diffing is indifferent to
  inline-vs-class, so it is a trustworthy oracle for exactly this change.
- **Contract + unit tests** stay green after the Page Object updates above.
- **Per-slice gate sequence:**
  `pnpm --filter @rtc/client-react typecheck` → unit → contract → visual.

## Sequence

All 45 files in one workstream, internally ordered to de-risk:

1. **Prove the pattern on one vertical slice (FX Tile).** Land `src/index.css`,
   the `data-*` / custom-property conventions, and the corresponding contract
   Page Object updates for that slice. Confirm **all gates green** (incl.
   unchanged visual goldens).
2. **Sweep the remaining components** against the now-proven pattern, group by
   group (fx/liveRates, fx/blotter, fx/analytics, credit/*, shell/*).
3. **Delete the imperative reset** from `main.tsx` once `index.css` is in place
   and verified.

Commit granularity (per-group vs single squashed) decided at commit time.

## Out of scope (YAGNI)

- No new `:hover`/`:focus` states, no responsive breakpoints, no keyframes.
- No visual redesign — pixels are held constant by the goldens.
- No shared "design-system" component extraction or shared style modules unless a
  duplication is already real (e.g. the blotter `cellStyle`); start per-component.

All of the above become easy follow-ups *once* styling lives in CSS.

## Risks

- **Contract tier breakage** if a `style.*` sniff is missed — mitigated by §
  "Contract-tier migration" enumerating the known call sites; the contract suite
  itself fails loudly if one is missed.
- **Accidental pixel drift** (e.g. specificity differences, a dropped property) —
  caught by the visual goldens, which are explicitly *not* regenerated.
- **CSS Modules class names in jsdom** are emitted but unstyled; any test must
  assert on `data-*`/text/role, never on computed style. Enforced by the Page
  Object rework.
