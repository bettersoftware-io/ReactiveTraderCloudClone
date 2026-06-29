# Ban inline `style={{…}}` props — lint rule design

**Date:** 2026-06-29
**Status:** Approved (brainstorm)

## Problem

The CSS Modules migration (complete, merged) moved all 191 inline styles in
`client-react` `src/ui` to co-located `*.module.css`. Its only guard was a
**manual grep gate** (`style={{` minus lines containing `--`), never wired into
CI. Nothing automatically stops a new arbitrary inline `style` prop from landing
in a merged PR — which is what prompted this work.

We want a lint rule that **fails CI** on any inline `style={{…}}` object literal
in production UI, forcing the proper CSS Module. The rare legitimate exception —
passing a runtime-computed value into CSS via a custom property — opts out
**loudly**, with a justified `eslint-disable` per occurrence.

## Decisions

- **Exception model: blanket ban + explicit disables.** The rule bans *every*
  inline `style={{…}}` literal, including the custom-property pattern. The
  genuine exceptions each carry an `// eslint-disable-next-line … -- <reason>`.
  Exceptions are individually visible and justified, rather than silently
  auto-allowed.
- **Scope: literal objects only.** The rule flags inline object literals
  (`style={{…}}`), with or without an `as CSSProperties` cast. A non-literal
  value — `style={variable}`, `style={fn()}` — passes. This matches the original
  grep gate's reach and avoids false positives on dynamic patterns.
- **Path scope: `packages/client-react/src/**` (production UI only).** The
  `tests/ui/visual/react/*` harness (`registry.tsx`, `VisualScenario.tsx`) uses
  ~13 real inline styles as layout scaffolding — including the panel-width
  wrapper that fixed the fx-blotter content-width flake. That is framework-
  neutral test plumbing, not production UI, and stays out of scope. A
  `packages/`-anchored glob also sidesteps the known sibling-worktree lint
  pollution (`.claude/worktrees/*`).
- **Home: existing ESLint `no-restricted-syntax` block** in `eslint.config.mjs`.
  This is the repo's established home for structural bans (inline object types,
  `useHooks` chaining). No new plugin, no Biome change — Biome's stable ruleset
  can't express custom AST selectors. CI already runs `lint:eslint`, so the rule
  is enforced on every PR and push-to-main with no new CI wiring.

## The rule

A new `files`-scoped ESLint config block targeting
`packages/client-react/src/**/*.tsx`, adding a `no-restricted-syntax` selector:

```
JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression,
JSXAttribute[name.name='style'] > JSXExpressionContainer > TSAsExpression > ObjectExpression
```

### Flat-config no-clobber requirement

ESLint flat config does **not** merge `no-restricted-syntax` arrays across
matching config blocks — for a file matched by several blocks, the *last*
block's setting fully **replaces** earlier ones (no array concatenation). A
scoped block containing only the style selector would therefore silently
**disable** the existing inline-object-type bans for client `src/`.

To avoid this, lift the existing selector array into a shared module-level
`const` and reference it in both places:

```js
const restrictedSyntax = [ /* existing inline-object-type + useHooks selectors */ ];
const styleProp = { selector: "…ObjectExpression, …TSAsExpression > ObjectExpression", message: "…" };

// general block (**/*.{ts,tsx}):
"no-restricted-syntax": ["error", ...restrictedSyntax],
// scoped block (packages/client-react/src/**/*.tsx), placed AFTER the general block:
"no-restricted-syntax": ["error", ...restrictedSyntax, styleProp],
```

Client `src/` files get the union; everything else (including the test harness)
keeps the original set only.

- First branch: `style={{ … }}`.
- Second branch: `style={{ … } as CSSProperties}` (the cast wraps the object in a
  `TSAsExpression`, so the object is no longer a direct child of the container).

Message:

> Inline `style={{…}}` is banned — move static styling to a co-located
> `*.module.css`. Only runtime-computed values (CSS custom properties) are
> exempt; if genuinely needed, add
> `// eslint-disable-next-line no-restricted-syntax -- <reason>`.

### Why not a smarter "auto-allow custom-prop" selector

Considered and rejected (per the exception-model decision): a selector that
allows objects whose keys are all `--custom-props` would need universal
quantification over properties, which esquery expresses awkwardly, and it would
make exceptions silent. Blanket-ban + explicit disable is simpler and louder.

## Existing exceptions (7)

Each current `src/` usage — all the sanctioned custom-property pattern — gets a
loud opt-out:

| File | Property |
|------|----------|
| `src/ui/fx/liveRates/tile/RfqCountdown.tsx` | `--rfq-fill` |
| `src/ui/fx/analytics/PairPnlBars.tsx` | `--bar-width` |
| `src/ui/shell/boot/BootSequence.tsx` | `--boot-pct` |
| `src/ui/equities/chart/DepthLadder.tsx` | `--depth` |
| `src/ui/equities/watchlist/Watchlist.tsx` | `--heat` |
| `src/ui/equities/watchlist/SectorHeatmap.tsx` | `--heat` |
| `src/ui/shell/chrome/ThemePicker.tsx` | `--swatch-1/2` |

The 7th (`ThemePicker`) is the validation of the AST-over-grep premise: it uses a
multi-line `style={ {…} }` (Biome wraps the object when it exceeds 80 cols), so
the `style={{` substring grep never saw it. The new rule does.

```tsx
// eslint-disable-next-line no-restricted-syntax -- runtime geometry via CSS custom property; static CSS can't express it
style={{ "--heat": heat } as CSSProperties}
```

For the multi-line `ThemePicker` case the disable comment sits *inside* the JSX
expression container, on the line directly above the object literal's `{`, so it
maps to the line ESLint reports (the object start) and survives Biome formatting.

## Trade-off accepted

`no-restricted-syntax` shares one rule id, so disable comments name
`no-restricted-syntax` rather than a bespoke rule name. This is consistent with
how the repo already disables `react-hooks/refs`. A dedicated named rule would
require a custom ESLint plugin — heavier, and YAGNI here.

## Verification

1. Add a throwaway `style={{ color: "red" }}` in an in-scope `src` component;
   confirm `pnpm lint:eslint` **fails** on it with the new message; remove it.
2. Confirm full `pnpm lint:eslint` passes **green** with the 6 disable comments
   in place.
3. Confirm `tests/ui/visual/react/*` inline styles are **not** flagged
   (out of scope).

No dedicated rule unit test: `no-restricted-syntax` selectors are config, not
code, and the repo's other selectors are likewise verified by CI firing, not a
test harness.

## Out of scope

- Test-harness inline styles (`tests/ui/visual/react/*`).
- Non-literal `style={…}` values.
- Migrating any of the 6 existing custom-property usages off inline `style`
  (they are the legitimate exception, kept by design).
- Any Biome/Stylelint change.
