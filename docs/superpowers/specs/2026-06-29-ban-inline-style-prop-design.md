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

## Existing exceptions (6)

Each of the 6 current `src/` usages — all the sanctioned custom-property pattern
— gets a loud opt-out:

| File | Property |
|------|----------|
| `src/ui/fx/liveRates/tile/RfqCountdown.tsx` | `--rfq-fill` |
| `src/ui/fx/analytics/PairPnlBars.tsx` | `--bar-width` |
| `src/ui/shell/boot/BootSequence.tsx` | `--boot-pct` |
| `src/ui/equities/chart/DepthLadder.tsx` | `--depth` |
| `src/ui/equities/watchlist/Watchlist.tsx` | `--heat` |
| `src/ui/equities/watchlist/SectorHeatmap.tsx` | `--heat` |

```tsx
// eslint-disable-next-line no-restricted-syntax -- runtime geometry via CSS custom property; static CSS can't express it
style={{ "--heat": heat } as CSSProperties}
```

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
