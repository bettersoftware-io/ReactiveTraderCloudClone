# CSS Modules Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 191 inline `style={{…}}` blocks across `@rtc/client-react` (45 files) with co-located CSS Modules, behavior-preservingly.

**Architecture:** Static styles → static classes in co-located `*.module.css` (keeping `var(--token)` verbatim). Boolean/enum state → semantic `data-*` attributes + CSS attribute selectors. Continuous data-driven geometry → inline CSS custom property (`style={{ "--x": … }}`) consumed by the class. The `:root` theme painting in `ThemeProvider` is untouched.

**Tech Stack:** Vite (native CSS Modules), React 18, TypeScript, Vitest (unit + contract), Playwright + vitest-browser (visual goldens).

## Global Constraints

- Scope is `packages/client-react` only. Do not touch `domain`, `shared`, `server`, `mobile`.
- **Visual goldens are the oracle and MUST NOT be regenerated.** No `--update`/`--update-snapshots` runs. An unexpected pixel diff is a migration bug to fix in code, not a golden to rebump.
- **Contract spec files (`tests/ui/contract/specs/**/*.contract.spec.ts`) MUST NOT change.** Only component `.tsx` and Page Objects (`tests/ui/contract/shared/pages/**`) change. Each reworked Page Object method must return the exact same value contract it returns today.
- No new runtime dependencies: no CSS-in-JS, no Tailwind, no `clsx`.
- camelCase CSS Modules class keys (`styles.tileContainer`).
- Keep every `var(--token)` reference verbatim — do not hardcode colors.
- SVG charts (`TileChart`, `PnlChart`) drive geometry via SVG attributes — leave their SVG attrs alone; only their *wrapper* `div` styles migrate.
- `ThemeProvider`'s `:root` token painting stays exactly as-is.
- Per-task gate sequence (run from `packages/client-react`):
  `pnpm --filter @rtc/client-react typecheck`
  → `pnpm --filter @rtc/client-react test` (unit)
  → `pnpm --filter @rtc/client-react test:ui:contract`
  → `pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react`
  → `pnpm --filter @rtc/client-react test:ui:visual:playwright-ct:react`
- TypeScript needs no CSS-module typing setup — `src/vite-env.d.ts` already references `vite/client`.

---

## The mechanical transformation procedure (applies to every component task)

For each component `Foo.tsx` with inline styles:

1. **Create `Foo.module.css`** beside it.
2. For each `style={{ … }}` literal, classify every property:
   - **Static** (constant value, incl. `var(--token)`): move into a named class. Convert camelCase JS keys to kebab CSS props (`backgroundColor` → `background-color`); numeric values without units that CSS needs `px` for get `px` (React added `px` implicitly — e.g. `padding: 12` → `padding: 12px`; unitless-legal props like `flex`, `opacity`, `zIndex`, `lineHeight`, `flexGrow` stay unitless). Keep `var(--token)` strings exactly.
   - **Boolean/enum state** (a value chosen by a ternary on a prop/state, e.g. `opacity: isLoading ? 0.5 : 1`, `fontWeight: active ? 600 : 400`, movement color): add a `data-*` attribute to the element expressing the *state* (`data-loading={isLoading}`, `data-active={active}`, `data-movement={…}`), and put both branches in CSS via attribute selectors on the class.
   - **Continuous data-driven geometry** (a value computed from numbers, e.g. `width: \`${f*100}%\``): keep an inline `style` carrying ONLY a CSS custom property (`style={{ "--rfq-fill": \`${f*100}%\` }}`), and consume it in the class (`width: var(--rfq-fill)`).
3. Add `import styles from "./Foo.module.css";` and replace each `style={{…}}` with `className={styles.someName}` (plus `data-*`/custom-property `style` where needed).
4. Preserve all existing `data-testid` attributes unchanged.
5. If a contract Page Object for this component reads `element.style.*` (enumerated per task), rework it to read the new `data-*`/custom-property and translate back to the value it currently returns.

CSS custom properties set inline ARE still readable via `el.style.getPropertyValue("--name")` in jsdom — that is why geometry uses them and why Page Objects can still read widths.

---

### Task 1: Global stylesheet + remove imperative reset

**Files:**
- Create: `packages/client-react/src/index.css`
- Modify: `packages/client-react/src/main.tsx:9-26` (delete the imperative `<style>` block; add an import)

**Interfaces:**
- Produces: a global reset loaded before the app renders. No exports.

- [ ] **Step 1: Create `src/index.css` with the existing reset, verbatim**

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body,
#root {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 2: Replace the imperative block in `main.tsx`**

Delete current lines 9–26 (the `const style = document.createElement("style") … document.head.appendChild(style);` block) and add an import at the top of the import group:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ThemeProvider } from "./ui/shell/theme/ThemeProvider";
import { App } from "./ui/App";
import { createApp, createMachineFactories } from "./app/composition";
import { createAppHooks } from "./ui/hooks/createAppHooks";
import { HooksProvider } from "./ui/hooks/HooksProvider";

const { presenters } = createApp();
const hooks = createAppHooks(presenters, createMachineFactories(presenters));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HooksProvider hooks={hooks}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </HooksProvider>
  </StrictMode>,
);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @rtc/client-react typecheck`
Expected: PASS.

- [ ] **Step 4: Run the visual goldens (the reset must paint identically)**

Run: `pnpm --filter @rtc/client-react test:ui:visual:playwright:react`
Expected: PASS, zero pixel diffs. (The reset moved from a JS-injected `<style>` to an imported stylesheet; output must be identical.)

- [ ] **Step 5: Commit**

```bash
git add packages/client-react/src/index.css packages/client-react/src/main.tsx
git commit -m "refactor(client): move global reset into imported index.css

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Pilot slice — RfqCountdown (geometry + enum-state worked example)

This task proves the geometry (custom property) and enum-state (`data-*`) patterns AND the Page-Object-preserves-contract rule end to end.

**Files:**
- Create: `packages/client-react/src/ui/fx/liveRates/tile/RfqCountdown.module.css`
- Modify: `packages/client-react/src/ui/fx/liveRates/tile/RfqCountdown.tsx`
- Modify: `packages/client-react/tests/ui/contract/shared/pages/fx/liveRates/tile/RfqCountdownPage.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the convention that `RfqCountdownPage.fillWidth()` returns e.g. `"50%"` and `fillColor()` returns `"var(--accent-primary)"` / `"var(--accent-aware)"` — unchanged contract. The fill element carries `data-testid="rfq-countdown-fill"`, an inline `--rfq-fill` custom property, and `data-warn={"true"|"false"}`.

- [ ] **Step 1: Run the existing contract spec to confirm GREEN baseline**

Run: `pnpm --filter @rtc/client-react test:ui:contract -- RfqCountdown`
Expected: PASS (6 tests).

- [ ] **Step 2: Create `RfqCountdown.module.css`**

```css
.wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.track {
  height: 4px;
  border-radius: 2px;
  background-color: var(--border-primary);
  overflow: hidden;
}

.fill {
  height: 100%;
  width: var(--rfq-fill);
  background-color: var(--accent-primary);
  transition: width 0.1s linear;
  border-radius: 2px;
}

.fill[data-warn="true"] {
  background-color: var(--accent-aware);
}

.caption {
  font-size: 10px;
  color: var(--text-muted);
  text-align: center;
}
```

- [ ] **Step 3: Rewrite `RfqCountdown.tsx`**

```tsx
import styles from "./RfqCountdown.module.css";

interface RfqCountdownProps {
  remainingMs: number;
  totalMs: number;
}

export function RfqCountdown({ remainingMs, totalMs }: RfqCountdownProps) {
  const fraction = totalMs > 0 ? remainingMs / totalMs : 0;
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div className={styles.wrapper}>
      <div className={styles.track}>
        <div
          data-testid="rfq-countdown-fill"
          data-warn={fraction <= 0.3 ? "true" : "false"}
          className={styles.fill}
          style={{ "--rfq-fill": `${fraction * 100}%` } as React.CSSProperties}
        />
      </div>
      <span className={styles.caption}>{seconds}s remaining</span>
    </div>
  );
}
```

Note the threshold: original was `fraction > 0.3 ? primary : aware`, so warn (aware) is `fraction <= 0.3`. Verify against the spec: `remainingMs: 2000, totalMs: 10000` → fraction 0.2 → warn true → aware. ✓ `5000/10000` → 0.5 → warn false → primary. ✓

- [ ] **Step 4: Rework `RfqCountdownPage.ts` to read the new hooks, same return contract**

```ts
import { MountedComponent } from "../../../../harness/component";

export interface RfqCountdownProps {
  remainingMs: number;
  totalMs: number;
}

export class RfqCountdownPage extends MountedComponent<RfqCountdownProps> {
  /** The "Ns remaining" caption text. */
  caption(): string {
    return this.root.querySelector("span")?.textContent?.trim() ?? "";
  }

  private fill(): HTMLDivElement | null {
    return this.root.querySelector<HTMLDivElement>(
      '[data-testid="rfq-countdown-fill"]',
    );
  }

  /** The progress-bar fill width, e.g. "50%". */
  fillWidth(): string {
    return this.fill()?.style.getPropertyValue("--rfq-fill").trim() ?? "";
  }

  /** The fill colour token (switches below the warn threshold). */
  fillColor(): string {
    const warn = this.fill()?.dataset.warn === "true";
    return warn ? "var(--accent-aware)" : "var(--accent-primary)";
  }
}
```

- [ ] **Step 5: Run the contract spec — MUST stay green with the spec file untouched**

Run: `pnpm --filter @rtc/client-react test:ui:contract -- RfqCountdown`
Expected: PASS (6 tests). If `fillWidth()` returns `""`, the custom property name is mismatched between `.tsx` and the Page Object.

- [ ] **Step 6: Run the visual goldens for the tile**

Run: `pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react`
Expected: PASS, zero pixel diffs.

- [ ] **Step 7: Typecheck + commit**

```bash
pnpm --filter @rtc/client-react typecheck
git add packages/client-react/src/ui/fx/liveRates/tile/RfqCountdown.tsx \
        packages/client-react/src/ui/fx/liveRates/tile/RfqCountdown.module.css \
        packages/client-react/tests/ui/contract/shared/pages/fx/liveRates/tile/RfqCountdownPage.ts
git commit -m "refactor(client): RfqCountdown inline styles -> CSS module

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Pilot slice — TilePrice (enum-state via data-movement worked example)

**Files:**
- Create: `packages/client-react/src/ui/fx/liveRates/tile/TilePrice.module.css`
- Modify: `packages/client-react/src/ui/fx/liveRates/tile/TilePrice.tsx`
- Modify: `packages/client-react/tests/ui/contract/shared/pages/fx/liveRates/tile/TilePricePage.ts`

**Interfaces:**
- Consumes: the data-attribute convention from Task 2.
- Produces: the big "pips" span carries `data-testid="tile-pips"` and `data-movement={"up"|"down"|"flat"}`. `TilePricePage.pipsColor(side)` still returns `"var(--accent-positive)"`, `"var(--accent-negative)"`, or `""`.

- [ ] **Step 1: Confirm GREEN baseline**

Run: `pnpm --filter @rtc/client-react test:ui:contract -- TilePrice`
Expected: PASS.

- [ ] **Step 2: Create `TilePrice.module.css`**

```css
.row {
  display: flex;
  gap: 4px;
}

.button {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 6px 8px;
  background: none;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-primary);
  transition: border-color 0.15s;
}

.button[data-side="bid"] {
  align-items: flex-start;
}

.button[data-side="ask"] {
  align-items: flex-end;
}

.label {
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.value {
  display: flex;
  align-items: baseline;
}

.prefix {
  font-size: 13px;
  color: var(--text-secondary);
}

.pips {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.pips[data-movement="up"] {
  color: var(--accent-positive);
}

.pips[data-movement="down"] {
  color: var(--accent-negative);
}

.fractional {
  font-size: 13px;
  color: var(--text-secondary);
  position: relative;
  top: -4px;
}

.spread {
  text-align: center;
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 0;
}
```

- [ ] **Step 3: Rewrite `TilePrice.tsx`**

```tsx
import { PriceMovementType, type Price } from "@rtc/domain";
import styles from "./TilePrice.module.css";

interface TilePriceProps {
  price: Price;
  ratePrecision: number;
  pipsPosition: number;
}

function splitPrice(
  value: number,
  ratePrecision: number,
  pipsPosition: number,
): { prefix: string; pips: string; fractional: string } {
  const formatted = value.toFixed(ratePrecision);
  const fractionalDigits = ratePrecision - pipsPosition;
  const pipEnd = formatted.length - fractionalDigits;
  const pipStart = pipEnd - 2;

  return {
    prefix: formatted.slice(0, pipStart),
    pips: formatted.slice(pipStart, pipEnd),
    fractional: fractionalDigits > 0 ? formatted.slice(pipEnd) : "",
  };
}

function movementKey(movement: PriceMovementType): "up" | "down" | "flat" {
  if (movement === PriceMovementType.UP) return "up";
  if (movement === PriceMovementType.DOWN) return "down";
  return "flat";
}

function PriceButton({
  label,
  value,
  ratePrecision,
  pipsPosition,
  movement,
  side,
}: {
  label: string;
  value: number;
  ratePrecision: number;
  pipsPosition: number;
  movement: PriceMovementType;
  side: "bid" | "ask";
}) {
  const { prefix, pips, fractional } = splitPrice(
    value,
    ratePrecision,
    pipsPosition,
  );

  return (
    <button className={styles.button} data-side={side}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        <span className={styles.prefix}>{prefix}</span>
        <span
          data-testid="tile-pips"
          data-movement={movementKey(movement)}
          className={styles.pips}
        >
          {pips}
        </span>
        <span className={styles.fractional}>{fractional}</span>
      </span>
    </button>
  );
}

export function TilePrice({ price, ratePrecision, pipsPosition }: TilePriceProps) {
  return (
    <div className={styles.row}>
      <PriceButton
        label="SELL"
        value={price.bid}
        ratePrecision={ratePrecision}
        pipsPosition={pipsPosition}
        movement={price.movementType}
        side="bid"
      />
      <PriceButton
        label="BUY"
        value={price.ask}
        ratePrecision={ratePrecision}
        pipsPosition={pipsPosition}
        movement={price.movementType}
        side="ask"
      />
    </div>
  );
}

export function SpreadDisplay({ spread }: { spread: string }) {
  return <div className={styles.spread}>{spread}</div>;
}
```

- [ ] **Step 4: Rework `TilePricePage.ts` `pipsColor`, same return contract**

Replace only the `pipsColor` method body (keep `buttons`, `labels`, `digits` as-is):

```ts
  /** The colour of the big "pips" segment on one side (movement-driven). */
  pipsColor(side: "SELL" | "BUY"): string {
    const btn = this.buttons().find((b) =>
      (b.querySelector("span")?.textContent ?? "").trim() === side,
    );
    if (!btn) throw new Error(`No ${side} button`);
    const pips = btn.querySelector<HTMLSpanElement>('[data-testid="tile-pips"]');
    const movement = pips?.dataset.movement;
    if (movement === "up") return "var(--accent-positive)";
    if (movement === "down") return "var(--accent-negative)";
    return "";
  }
```

- [ ] **Step 5: Contract spec stays green (spec file untouched)**

Run: `pnpm --filter @rtc/client-react test:ui:contract -- TilePrice`
Expected: PASS.

- [ ] **Step 6: Typecheck + visual + commit**

```bash
pnpm --filter @rtc/client-react typecheck
pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react
git add packages/client-react/src/ui/fx/liveRates/tile/TilePrice.tsx \
        packages/client-react/src/ui/fx/liveRates/tile/TilePrice.module.css \
        packages/client-react/tests/ui/contract/shared/pages/fx/liveRates/tile/TilePricePage.ts
git commit -m "refactor(client): TilePrice inline styles -> CSS module

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Finish the tile slice (static-only components)

The remaining tile components have **static styles only** (verify each; if you find a ternary-driven style, apply the Task 2/3 patterns and check for a Page Object that reads it). Each gets a co-located `.module.css` per the mechanical procedure.

**Files:** for each, create `X.module.css` and modify `X.tsx`:
- `packages/client-react/src/ui/fx/liveRates/tile/Tile.tsx` (note: `opacity: isLoading ? 0.5 : 1` is enum-state → `data-loading` on the container; `minWidth: 280` etc. static)
- `packages/client-react/src/ui/fx/liveRates/tile/TileHeader.tsx`
- `packages/client-react/src/ui/fx/liveRates/tile/TileChart.tsx` (migrate the wrapper `div` only; leave the `<svg>`/`<path>` attributes alone)
- `packages/client-react/src/ui/fx/liveRates/tile/TileNotional.tsx` (note: `borderBottom` is error-state → `data-error`; rework `TileNotionalPage.ts` `inputBorder()` to read `data-error` and return the same border string it returns today)
- `packages/client-react/src/ui/fx/liveRates/tile/TileExecution.tsx`
- `packages/client-react/src/ui/fx/liveRates/tile/TileConfirmation.tsx` (note: overlay `backgroundColor`/`cursor` read by `TileConfirmationPage.ts` — add `data-state`/`data-testid` hooks and rework the Page Object to return today's strings)
- `packages/client-react/src/ui/fx/liveRates/tile/TileRfq.tsx`
- `packages/client-react/src/ui/shell/stale/StaleIndicator.tsx` (wraps the tile; check `TilePage.ts` error-span lookup that uses `style.position === "absolute"` → give that span `data-testid` and update `TilePage.ts`)

**Interfaces:**
- Consumes: the data-attribute + custom-property conventions from Tasks 2–3.
- Produces: the entire FX tile renders from CSS modules; tile-related Page Objects (`TilePage`, `TileNotionalPage`, `TileConfirmationPage`) read `data-*`/`data-testid`, not inline style.

- [ ] **Step 1: Confirm GREEN baseline for the tile suites**

Run: `pnpm --filter @rtc/client-react test:ui:contract -- tile`
Expected: PASS.

- [ ] **Step 2: Migrate each component above** following the mechanical procedure. For every Page Object that currently reads `element.style.*` (`TileNotionalPage.inputBorder`, `TileConfirmationPage` background/cursor, `TilePage` error-span-by-position), add a `data-testid`/`data-*` hook in the component and rewrite the Page Object method to read it and return the identical value contract.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @rtc/client-react typecheck`
Expected: PASS.

- [ ] **Step 4: Full contract tier**

Run: `pnpm --filter @rtc/client-react test:ui:contract`
Expected: PASS (spec files unchanged).

- [ ] **Step 5: Both visual golden tiers — zero diffs**

Run:
`pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react`
`pnpm --filter @rtc/client-react test:ui:visual:playwright-ct:react`
Expected: PASS, zero pixel diffs.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react/src/ui/fx/liveRates/tile packages/client-react/src/ui/shell/stale packages/client-react/tests/ui/contract/shared/pages/fx/liveRates/tile
git commit -m "refactor(client): migrate remaining FX tile components to CSS modules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: fx/liveRates panel + controls

**Files:** create `X.module.css` + modify `X.tsx` for:
- `packages/client-react/src/ui/fx/liveRates/LiveRatesPanel.tsx`
- `packages/client-react/src/ui/fx/liveRates/CurrencyFilter.tsx` (active filter via `fontWeight:600` → `data-active`; rework `CurrencyFilterPage.ts` `activeLabel()`)
- `packages/client-react/src/ui/fx/liveRates/ViewToggle.tsx`
- Modify: `packages/client-react/tests/ui/contract/shared/pages/fx/liveRates/CurrencyFilterPage.ts`

**`CurrencyFilterPage.ts` rework** — current `activeLabel()` finds the button with `style.fontWeight === "600"`. Replace with:

```ts
  /** The label of the currently-active filter button. */
  activeLabel(): string {
    const buttons = [...this.root.querySelectorAll<HTMLButtonElement>("button")];
    const active = buttons.find((b) => b.dataset.active === "true");
    return (active?.textContent ?? "").trim();
  }
```

In `CurrencyFilter.tsx`, give each filter button `data-active={cat === activeCat ? "true" : "false"}` and move the `fontWeight: active ? 600 : 400` into `.filter[data-active="true"] { font-weight: 600; }`.

- [ ] **Step 1:** Baseline: `pnpm --filter @rtc/client-react test:ui:contract -- CurrencyFilter` → PASS.
- [ ] **Step 2:** Migrate the three components per the procedure; rework `CurrencyFilterPage.ts`.
- [ ] **Step 3:** `pnpm --filter @rtc/client-react typecheck` → PASS.
- [ ] **Step 4:** `pnpm --filter @rtc/client-react test:ui:contract` → PASS.
- [ ] **Step 5:** `pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react` + `:playwright-ct:react` → zero diffs.
- [ ] **Step 6: Commit**

```bash
git add packages/client-react/src/ui/fx/liveRates packages/client-react/tests/ui/contract/shared/pages/fx/liveRates/CurrencyFilterPage.ts
git commit -m "refactor(client): migrate fx/liveRates panel + controls to CSS modules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: fx/blotter

**Files:** create `X.module.css` + modify `X.tsx` for:
- `packages/client-react/src/ui/fx/blotter/FxBlotter.tsx`
- `packages/client-react/src/ui/fx/blotter/BlotterHeader.tsx` (sort/active states → `data-*`; dropdown `top:100%` is static)
- `packages/client-react/src/ui/fx/blotter/BlotterRow.tsx` (done row `textDecoration: line-through` + `backgroundColor` → `data-settled`/`data-state`; rework `BlotterRowPage.ts`)
- `packages/client-react/src/ui/fx/blotter/QuickFilter.tsx`
- `packages/client-react/src/ui/fx/blotter/columnFilter/DateFilter.tsx`
- `packages/client-react/src/ui/fx/blotter/columnFilter/NumberFilter.tsx`
- `packages/client-react/src/ui/fx/blotter/columnFilter/SetFilter.tsx`
- Modify: `packages/client-react/tests/ui/contract/shared/pages/fx/blotter/BlotterRowPage.ts`

**`BlotterRowPage.ts` rework** — current `isDone()` reads `style.textDecoration === "line-through"`; `background()` reads `style.backgroundColor`. In `BlotterRow.tsx`, drive both off one `data-state` (e.g. `"done"|"live"`) attribute on the `<tr>`, moving the line-through + background into `.row[data-state="done"]` CSS. Rework the Page Object:

```ts
  /** Whether the row renders as a completed/settled trade. */
  isDone(): boolean {
    return this.row().dataset.state === "done";
  }

  /** The semantic row state token ("done" | "live"). Replaces colour sniffing. */
  state(): string {
    return this.row().dataset.state ?? "";
  }
```

NOTE: if `BlotterRow.contract.spec.ts` calls `background()` expecting a color string, do NOT delete `background()` — instead keep it returning the same token contract by mapping `data-state` → the expected `var(--…)` string, exactly as Task 2 did for `fillColor()`. Inspect the spec first (`tests/ui/contract/specs/fx/blotter/BlotterRow.contract.spec.ts`) and preserve whatever it asserts.

- [ ] **Step 1:** Baseline: `pnpm --filter @rtc/client-react test:ui:contract -- blotter` → PASS. Read `BlotterRow.contract.spec.ts` to learn the exact assertions to preserve.
- [ ] **Step 2:** Migrate the seven components; rework `BlotterRowPage.ts` keeping its return contract.
- [ ] **Step 3:** `pnpm --filter @rtc/client-react typecheck` → PASS.
- [ ] **Step 4:** `pnpm --filter @rtc/client-react test:ui:contract` → PASS.
- [ ] **Step 5:** both visual tiers → zero diffs.
- [ ] **Step 6: Commit**

```bash
git add packages/client-react/src/ui/fx/blotter packages/client-react/tests/ui/contract/shared/pages/fx/blotter
git commit -m "refactor(client): migrate fx/blotter to CSS modules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: fx/analytics (geometry-heavy)

**Files:** create `X.module.css` + modify `X.tsx` for:
- `packages/client-react/src/ui/fx/analytics/AnalyticsPanel.tsx`
- `packages/client-react/src/ui/fx/analytics/PnlValue.tsx` (sign-driven color → `data-sign={"pos"|"neg"|"zero"}`)
- `packages/client-react/src/ui/fx/analytics/PairPnlBars.tsx` (`barWidth = \`${Math.abs(fraction)*50}%\`` → inline `--bar-width` custom property; pos/neg side → `data-sign`)
- `packages/client-react/src/ui/fx/analytics/PositionBubbles.tsx` (bubble size/position computed from data → inline custom properties `--size`, `--x`, `--y`; static styles to classes)
- `packages/client-react/src/ui/fx/analytics/PnlChart.tsx` (wrapper `div` only; leave SVG attributes)

**Interfaces:**
- Consumes: the custom-property geometry pattern from Task 2.
- Produces: analytics renders from CSS modules; data-driven sizes/positions ride inline custom properties consumed by classes.

- [ ] **Step 1:** Baseline: `pnpm --filter @rtc/client-react test:ui:contract -- analytics` (or run full contract) → PASS. Check whether any analytics Page Object reads `style.*` and rework as in earlier tasks.
- [ ] **Step 2:** Migrate the five components per the procedure.
- [ ] **Step 3:** `pnpm --filter @rtc/client-react typecheck` → PASS.
- [ ] **Step 4:** `pnpm --filter @rtc/client-react test:ui:contract` → PASS.
- [ ] **Step 5:** both visual tiers → zero diffs (bubble/bar geometry is the highest pixel-drift risk — inspect any diff image carefully).
- [ ] **Step 6: Commit**

```bash
git add packages/client-react/src/ui/fx/analytics packages/client-react/tests/ui/contract/shared/pages/fx/analytics
git commit -m "refactor(client): migrate fx/analytics to CSS modules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: shell (layout, connection, theme)

**Files:** create `X.module.css` + modify `X.tsx` for:
- `packages/client-react/src/ui/shell/layout/Header.tsx` (active nav via `fontWeight:600` → `data-active`; rework `HeaderPage.ts`)
- `packages/client-react/src/ui/shell/layout/Footer.tsx`
- `packages/client-react/src/ui/shell/layout/Workspace.tsx`
- `packages/client-react/src/ui/shell/connection/ConnectionOverlay.tsx` (`--bg-overlay` static)
- `packages/client-react/src/ui/shell/connection/ConnectionStatusBar.tsx` (status color → `data-status={"connected"|"connecting"|"disconnected"}`)
- `packages/client-react/src/ui/shell/theme/ThemeToggle.tsx`
- Modify: `packages/client-react/tests/ui/contract/shared/pages/shell/layout/HeaderPage.ts`

**`HeaderPage.ts` rework** — current active-detection reads `button.style.fontWeight === "600"`. In `Header.tsx`, set `data-active` on the active nav button and move `font-weight: 600` into `.navButton[data-active="true"]`. Rework:

```ts
  /** Whether the given nav button is the active one. */
  isActive(button: HTMLButtonElement): boolean {
    return button.dataset.active === "true";
  }
```

(Adjust to match `HeaderPage.ts`'s actual method shape — preserve its current signature and return type.)

- [ ] **Step 1:** Baseline: `pnpm --filter @rtc/client-react test:ui:contract -- Header` → PASS.
- [ ] **Step 2:** Migrate the six components; rework `HeaderPage.ts` preserving its signatures.
- [ ] **Step 3:** `pnpm --filter @rtc/client-react typecheck` → PASS.
- [ ] **Step 4:** `pnpm --filter @rtc/client-react test:ui:contract` → PASS.
- [ ] **Step 5:** both visual tiers → zero diffs.
- [ ] **Step 6: Commit**

```bash
git add packages/client-react/src/ui/shell packages/client-react/tests/ui/contract/shared/pages/shell
git commit -m "refactor(client): migrate shell components to CSS modules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: credit workspace

**Files:** create `X.module.css` + modify `X.tsx` for every credit component:
- `packages/client-react/src/ui/credit/CreditWorkspace.tsx` (tab active state → `data-active`)
- `packages/client-react/src/ui/credit/rfqTiles/RfqTilesPanel.tsx`
- `packages/client-react/src/ui/credit/rfqTiles/RfqCard.tsx`
- `packages/client-react/src/ui/credit/rfqTiles/QuoteCard.tsx`
- `packages/client-react/src/ui/credit/rfqTiles/RfqFilterTabs.tsx` (active tab via `fontWeight:600` → `data-active`; rework `RfqFilterTabsPage.ts`)
- `packages/client-react/src/ui/credit/newRfq/NewRfqForm.tsx`
- `packages/client-react/src/ui/credit/newRfq/InstrumentSearch.tsx` (dropdown `top:100%`, `width:100%` static)
- `packages/client-react/src/ui/credit/newRfq/DealerSelection.tsx`
- `packages/client-react/src/ui/credit/newRfq/QuantityInput.tsx`
- `packages/client-react/src/ui/credit/blotter/CreditBlotter.tsx` (shared `cellStyle` object → a `.cell` class; `table width:100%` static)
- `packages/client-react/src/ui/credit/sellSide/SellSidePanel.tsx`
- `packages/client-react/src/ui/credit/sellSide/TradeTicket.tsx`
- Modify: `packages/client-react/tests/ui/contract/shared/pages/credit/rfqTiles/RfqFilterTabsPage.ts`

**`RfqFilterTabsPage.ts` rework** — current active-detection reads `btn.style.fontWeight === "600"`. Mirror the Header/CurrencyFilter rework: `data-active` on the active tab, `font-weight: 600` in `.tab[data-active="true"]`, Page Object reads `dataset.active`.

**`CreditBlotter.tsx` note:** the shared `cellStyle` constant (used by multiple `<td>`) becomes a single `.cell` class — this is the one allowed shared-within-file extraction; do not over-abstract across files.

- [ ] **Step 1:** Baseline: `pnpm --filter @rtc/client-react test:ui:contract -- credit` → PASS. Read `RfqFilterTabs.contract.spec.ts` for the exact active-tab assertion to preserve.
- [ ] **Step 2:** Migrate every credit component; rework `RfqFilterTabsPage.ts`.
- [ ] **Step 3:** `pnpm --filter @rtc/client-react typecheck` → PASS.
- [ ] **Step 4:** `pnpm --filter @rtc/client-react test:ui:contract` → PASS.
- [ ] **Step 5:** both visual tiers → zero diffs.
- [ ] **Step 6: Commit**

```bash
git add packages/client-react/src/ui/credit packages/client-react/tests/ui/contract/shared/pages/credit
git commit -m "refactor(client): migrate credit workspace to CSS modules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: admin + App shell + final sweep

**Files:** create `X.module.css` + modify `X.tsx` for:
- `packages/client-react/src/ui/admin/AdminPanel.tsx`
- `packages/client-react/src/ui/App.tsx` (`height: 100vh`, layout → classes)

**Interfaces:**
- Produces: zero inline `style={{…}}` remain except those carrying ONLY CSS custom properties for data-driven geometry.

- [ ] **Step 1:** Migrate `AdminPanel.tsx` and `App.tsx` per the procedure.

- [ ] **Step 2: Assert the migration is complete — only custom-property styles remain**

Run:
```bash
grep -rn "style={{" packages/client-react/src/ui --include="*.tsx" | grep -v -- "--"
```
Expected: NO output (every remaining `style={{` sets a `--custom-property`). If any line prints, it is an unmigrated static/enum style — migrate it.

- [ ] **Step 3: Full typecheck (all four tsconfigs)**

Run: `pnpm --filter @rtc/client-react typecheck`
Expected: PASS.

- [ ] **Step 4: Full unit + contract + both visual tiers**

Run:
```bash
pnpm --filter @rtc/client-react test
pnpm --filter @rtc/client-react test:ui:contract
pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react
pnpm --filter @rtc/client-react test:ui:visual:playwright-ct:react
pnpm --filter @rtc/client-react test:ui:visual:playwright:react
```
Expected: ALL PASS, zero pixel diffs across every visual tier.

- [ ] **Step 5: Confirm specs and goldens were never touched**

Run:
```bash
git diff --name-only main -- packages/client-react/tests/ui/contract/specs packages/client-react/tests/ui/visual | grep -E "\.contract\.spec\.ts$|\.png$" || echo "clean: no spec or golden files changed"
```
Expected: `clean: no spec or golden files changed`. (If any spec or `.png` appears, revisit — the migration must not have changed them.)

- [ ] **Step 6: Commit**

```bash
git add packages/client-react/src/ui/admin packages/client-react/src/ui/App.tsx packages/client-react/src/ui/App.module.css packages/client-react/src/ui/admin/AdminPanel.module.css
git commit -m "refactor(client): migrate admin + App shell to CSS modules; finish migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Three style categories (static / enum-state / geometry) → defined in the mechanical procedure, applied in Tasks 2–10. ✓
- `index.css` + remove imperative reset → Task 1. ✓
- CSS Modules co-located, camelCase keys, `var(--token)` preserved → procedure + every task. ✓
- ThemeProvider `:root` untouched → Global Constraints. ✓
- Contract-tier rework from style-sniffing to `data-*`, spec files unchanged → Tasks 2,3,4,5,6,8,9 enumerate every style-sniffing Page Object (RfqCountdown, TilePrice, TileNotional, TileConfirmation, TilePage, CurrencyFilter, BlotterRow, Header, RfqFilterTabs). ✓
- Visual goldens as oracle, never regenerated → Global Constraints + per-task Step 5 + Task 10 Step 5. ✓
- All 45 files, all-at-once workstream, FX-Tile pilot first → Tasks 2–4 pilot, 5–10 sweep. ✓
- YAGNI (no hover/redesign/shared modules beyond in-file `cell`/`cellStyle`) → noted in Task 9. ✓

**Placeholder scan:** Worked code given in full for Task 1, 2, 3, and every Page Object rework (RfqCountdownPage, TilePricePage, CurrencyFilterPage, BlotterRowPage, HeaderPage). Sweep tasks (4,6,7,8,9) reference the fully-specified mechanical procedure rather than repeating 191 verbatim conversions; each names its exact files and the specific stateful hooks/Page-Object reworks that carry judgment. The completeness gate (Task 10 Step 2 grep) mechanically proves no inline style was missed.

**Type consistency:** `movementKey` returns `"up"|"down"|"flat"`, read back by `TilePricePage.pipsColor`. `data-warn` written `"true"|"false"` in RfqCountdown, read by `RfqCountdownPage.fillColor`. `--rfq-fill` written in RfqCountdown.tsx, read in RfqCountdownPage + RfqCountdown.module.css. `data-active` convention consistent across CurrencyFilter/Header/RfqFilterTabs/CreditWorkspace and their Page Objects. ✓
