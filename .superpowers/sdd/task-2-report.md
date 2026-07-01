## Task 2 Report: AmbientBackground + AppShell integration

### What was built

- **`packages/client-prototype/src/shell/ambient/AmbientBackground.tsx`** — New component. No props. Returns `ReactElement`. Renders 7 layers from PROTO 103–112: `.ambient` root (aria-hidden, data-testid, pointer-events:none), `.aurora` wrapper, `.auroraA`, `.auroraB`, `.sweep`, `.grid`, `.particles`, `.vignette`. Function declaration, CSS module imports only.

- **`packages/client-prototype/src/shell/ambient/AmbientBackground.module.css`** — 7 CSS classes. All animated layers end with `animation-play-state: var(--amb-play, paused)`. Each layer is a verbatim port of its PROTO inline style (gradients, blur, opacity, `inset:-25%` for aurora blobs, `170vmax` sweep square centered via `margin:-85vmax 0 0 -85vmax`). Theme vars used: `--accent`, `--accent2`, `--buy`, `--grid`, `--aurora-op` (from `themeVars.ts` camelCase-to-kebab of `auroraOp`). `--amb-play` (set by Task 1's PreferencesProvider). Biome reformatted multi-value `background`, `background-image`, `background-size`, and `conic-gradient` onto multiple lines (auto-fixed).

- **`packages/client-prototype/src/shell/AppShell.tsx`** — Added `import { AmbientBackground }` and rendered it as the first child of `.shell`, before `.body`. Biome reordered the import (CSS module before component import).

- **`packages/client-prototype/src/shell/AppShell.module.css`** — Added `position: relative` and `overflow: hidden` to `.shell` so the absolutely-positioned `AmbientBackground` is contained within it.

- **`packages/client-prototype/tests/ambient.test.tsx`** — New test: renders `<AmbientBackground />`, asserts `[data-testid="ambient"]` is present and `aria-hidden="true"`.

### RED → GREEN evidence

Test was written before the component. Import from non-existent `#/shell/ambient/AmbientBackground` would have failed at resolution time (type error on import + no export). After creating the component + CSS module, the test immediately passed.

Final run: `Tests 12 passed (12)` — the new test plus all 11 pre-existing tests green.

### Gate results

| Gate | Result |
|------|--------|
| `pnpm --filter @rtc/client-prototype typecheck` | PASS (exit 0, no output) |
| `pnpm --filter @rtc/client-prototype test` | PASS (12/12) |
| `pnpm exec biome check packages/client-prototype/src packages/client-prototype/tests` | PASS (0 errors after `--write` auto-fix) |
| `pnpm exec eslint packages/client-prototype/src packages/client-prototype/tests` | PASS (no output) |
| `pnpm exec stylelint "packages/client-prototype/src/**/*.module.css"` | PASS (no output) |

Auto-fixes applied by `biome check --write`:
1. AppShell.tsx import order: CSS module import hoisted above component import.
2. AmbientBackground.module.css gradient formatting: multi-value `background`, `background-image`, `background-size`, `conic-gradient` expanded to multi-line (Biome's CSS formatter preference).

### Files changed

| File | Change |
|------|--------|
| `src/shell/ambient/AmbientBackground.tsx` | Created |
| `src/shell/ambient/AmbientBackground.module.css` | Created |
| `src/shell/AppShell.tsx` | Modified (added AmbientBackground import + render) |
| `src/shell/AppShell.module.css` | Modified (added position:relative + overflow:hidden to .shell) |
| `tests/ambient.test.tsx` | Created |

### Self-review

- All 7 layer classes faithfully port PROTO 103–112.
- `--amb-play` naming matches Task 1's PreferencesProvider output (confirmed by preferences.test.tsx passing without changes).
- `--aurora-op` correctly matches `themeVars.ts` camelCase→kebab conversion of `auroraOp`.
- Zero `style={{}}` inline props; zero raw hex literals; `color`/`fill`/`stroke` properties absent from the module (stylelint strict-value rule never fires).
- `rgba(0, 0, 0, 0.58)` in `.vignette` is in the `background` property — exempt from the strict-value rule (which covers only `color`/`fill`/`stroke`). Stylelint confirms clean.
- Component is aria-hidden and pointer-events:none — purely decorative layer.
- AppShell still renders children via `.body`; existing app.test.tsx passes, confirming no regression.

### Concerns

None. All layers ported verbatim; all gates green.
