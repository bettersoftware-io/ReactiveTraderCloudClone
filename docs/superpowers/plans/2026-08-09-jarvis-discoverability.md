# Jarvis Discoverability Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make everything Jarvis can already do findable — a shared guide catalog, the ⓘ demo-guide panel, rotating hint chips, a hands-free scripted full demo, and the persona panel-id roster fixing the observed drive-targeting failure.

**Architecture:** One framework-free catalog in `client-core` feeds the chips, the guide panel, and the demo script. A `JarvisDemoMachine` (ADR-005 autonomous fold) plays the demo through the real `JarvisMachine` on the scripted brain via a new `sendScripted` intent. The persona's panel roster derives from a new `@rtc/shared` constant that `client-core` conformance-tests against its layout trees — the only dependency-legal never-drift shape.

**Tech Stack:** TypeScript, RxJS (`TestScheduler` for the machine), React 19 + SolidJS with byte-identical CSS modules, `@rtc/ui-contract` swap-trio specs, Playwright (visual + e2e).

**Spec:** `docs/superpowers/specs/2026-08-09-jarvis-discoverability-design.md`

## Deviations from the spec (settled at plan time, from the fact-sheet audit)

1. **§5 "the overlay's open-counter, already observable"** — no such counter exists. Task 4 adds `openCount` to `JarvisState`.
2. **§7/§8 "roster derived from `defaultLayoutPort`, unit test in server"** — the server cannot import `client-core` (workspace graph). Task 1 promotes an id/title roster to `@rtc/shared`; the conformance test pinning it against the layout trees lives in `client-core` (legal both ways).
3. **§2/§6 `ask(text, {brain:"scripted"})`** — not reachable through the machine, and `JarvisAskOptions` requires `effort` too. Task 4 adds the `sendScripted` intent; the override happens at the machine's single `ask` call site.
4. **§8 "E2e (Gherkin)"** — no Gherkin Jarvis suite exists; Jarvis e2e is plain Playwright (`tests/browser/playwright/jarvis.spec.ts`). Task 9 extends that pattern (same deviation class as the governance round's Gherkin→node-smoke ruling).
5. **§4 footer copy** — the live footer reads `ESC · CLOSE` / `⌘J · TOGGLE` / `CORE` + two skin-mark buttons (no `▸ SWITCH`, no `CTRL+J`). New entries match the real footer, not the prototype literal.
6. **§6 "closing line"** — dropped. A synthetic closing line would need a new scripted intent; the morning-workspace reply is the natural closer (matches the prototype, whose last step is also the workspace).
7. **§6 step order** — `setupWorkspace` runs LAST: its scripted reply chains `streamShowPanelReply`, re-emitting the panel at `viz:"line"`, which would visually undo an earlier restyle if it ran mid-script. As the finale this re-emission is invisible (the workspace IS the closing visual). The demo ends on the equities tab with the chart maximized — intended.
8. **§5 sampler** — chips draw only non-`liveOnly` items (a `liveOnly` chip on a scripted-effective brain would fallback; chips are one-click promises).

## Global Constraints

- **No Anthropic API calls in any CI-run test** — the demo and every new test ride the scripted brain (zero tokens).
- Demo turns send `{ brain: "scripted", effort }` (both fields — `JarvisAskOptions` requires both); the user's brain preference is never written.
- Auto-decline copy is the engine's exact `DECLINED_REPLY`: `"Understood, sir — standing down. Nothing was executed."` — the demo never approves a trade.
- CSS modules byte-identical between `client-react` and `client-solid` (`diff` must be empty).
- Function names state their **effect** (`docs/handler-naming.md`); slots stay `onX`.
- No inline `style={{…}}`; Biome + mandatory braces; `#/` alias imports inside packages; every control statement braced.
- UI contract coverage gates: react ≥95%, solid ≥95% (branches ≥85%) — new UI needs covering contract specs.
- Panel ids/titles verbatim from `defaultLayoutPort.ts`: fx `fx-rates`(Live Rates)/`fx-blotter`(Blotter)/`fx-analytics`(Analytics)/`fx-positions`(Positions); credit `credit-new-rfq`(New RFQ)/`credit-rfqs`(RFQs)/`credit-blotter`(Credit Blotter); admin `admin-dashboard`(Admin); equities `eq-chart`(Equities)/`eq-blotter`(Orders & Positions)/`eq-ticket`(Order Ticket)/`eq-watchlist`(Watchlist). Default-tree panels only (12) — never the 3 off-tree specs (`credit-sell-side`, `eq-depth`, `eq-sectors`).
- Persona length guard raised to **3600** in the same commit that grows the prompt (deliberate, ledger-noted); `driveExampleLines` count becomes **3**, `allExampleLines` **5**.
- New testids: `jarvis-guide-toggle`, `jarvis-guide-panel`, `jarvis-guide-run`, `jarvis-guide-row`, `jarvis-guide-live-badge`, `jarvis-demo-run`, `jarvis-demo-progress`, `jarvis-demo-stop`.
- Demo pacing: `DEMO_STEP_BEAT_MS = 1200`; beat is `0` under power-saver `"freeze"` (the P5 drive-stagger rule).

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `packages/shared/src/jarvis/deskPanels.ts` (create) | 1 | `DESK_PANEL_ROSTER` — per-tab id/title, the dependency-legal source |
| `packages/client-core/src/layout/defaultLayoutPort.rosterConformance.test.ts` (create) | 1 | tree ↔ roster never-drift gate |
| `packages/server/src/agent/jarvisPersona.ts` (modify) | 2 | roster block + FX worked example |
| `packages/server/src/agent/jarvisPersona.test.ts` (modify) | 2 | guard 3600, counts 3/5, roster-derivation pin |
| `packages/client-core/src/presenters/jarvisGuideCatalog.ts` (create) | 3 | `JARVIS_GUIDE_CATALOG`, `sampleGuideChips` |
| `packages/client-core/src/presenters/jarvisGuideCatalog.test.ts` (create) | 3 | intent conformance + sampler determinism |
| `packages/client-core/src/presenters/JarvisMachine.ts` (modify) | 4 | `sendScripted` intent, `openCount` state |
| `packages/client-core/src/presenters/JarvisDemoMachine.ts` (create) | 5 | the autoplay fold |
| `packages/client-core/src/composition.ts` (modify) | 5 | `jarvisDemo` singleton on `Presenters` |
| `packages/{react,solid}-bindings/src/createViewModel.ts` (modify) | 5 | `useJarvisDemo` accessor |
| `packages/client-react/src/ui/shell/jarvis/JarvisOverlay.tsx` + `.module.css` (modify) | 6 | guide panel, footer entries, rotating chips |
| `packages/client-solid/src/ui/shell/jarvis/JarvisOverlay.tsx` + `.module.css` (modify) | 7 | byte-identical mirror |
| `packages/ui-contract/src/shared/pages/shell/jarvis/JarvisOverlayPage.ts` (modify) | 8 | guide/demo accessors |
| `packages/ui-contract/src/specs/shell/jarvis/JarvisOverlay.contract.spec.ts` (modify) | 8 | guide/chips/demo cases |
| `packages/ui-contract/src/visual/{scenarios,fixtures,scenarioActions}.ts` (modify) | 8 | `jarvis/overlay-guide` scenario |
| `tests/browser/scenarios/jarvis.ts` + `tests/browser/playwright/jarvis.spec.ts` (modify) | 9 | guide-click + demo-start/stop rides |
| `docs/STATUS.md`, `docs/IDEAS.md` cross-check (modify) | 10 | close-out |

---

### Task 1: `DESK_PANEL_ROSTER` in `@rtc/shared` + client-core conformance gate

**Files:**
- Create: `packages/shared/src/jarvis/deskPanels.ts`
- Modify: `packages/shared/src/index.ts` (export)
- Test: `packages/shared/src/jarvis/__tests__/deskPanels.test.ts`
- Test: `packages/client-core/src/layout/defaultLayoutPort.rosterConformance.test.ts`

**Interfaces:**
- Produces: `DeskPanelInfo { readonly id: string; readonly title: string }`; `DESK_PANEL_ROSTER: Record<DriveTab, readonly DeskPanelInfo[]>` (import `DriveTab` from `./driveCommand.js`). Task 2 (persona) and nothing else consumes it server-side; the client-core test consumes it dev-side.

- [ ] **Step 1: Write the shared module test**

```ts
// packages/shared/src/jarvis/__tests__/deskPanels.test.ts
import { describe, expect, it } from "vitest";
import { DESK_PANEL_ROSTER } from "../deskPanels.js";
import { DRIVE_TABS } from "../driveCommand.js";

describe("DESK_PANEL_ROSTER", () => {
  it("covers every drive tab", () => {
    expect(Object.keys(DESK_PANEL_ROSTER).sort()).toEqual([...DRIVE_TABS].sort());
  });

  it("pins the default-tree panels per tab (ids and titles)", () => {
    expect(DESK_PANEL_ROSTER.fx).toEqual([
      { id: "fx-rates", title: "Live Rates" },
      { id: "fx-blotter", title: "Blotter" },
      { id: "fx-analytics", title: "Analytics" },
      { id: "fx-positions", title: "Positions" },
    ]);
    expect(DESK_PANEL_ROSTER.credit.map((p) => p.id)).toEqual([
      "credit-new-rfq", "credit-rfqs", "credit-blotter",
    ]);
    expect(DESK_PANEL_ROSTER.admin).toEqual([{ id: "admin-dashboard", title: "Admin" }]);
    expect(DESK_PANEL_ROSTER.equities.map((p) => p.id)).toEqual([
      "eq-chart", "eq-blotter", "eq-ticket", "eq-watchlist",
    ]);
  });

  it("never lists an off-tree panel", () => {
    const all = Object.values(DESK_PANEL_ROSTER).flat().map((p) => p.id);
    for (const offTree of ["credit-sell-side", "eq-depth", "eq-sectors"]) {
      expect(all).not.toContain(offTree);
    }
  });
});
```

- [ ] **Step 2: Run it — FAIL (module missing)**

Run: `pnpm --filter @rtc/shared test -- deskPanels`

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/jarvis/deskPanels.ts
import type { DriveTab } from "./driveCommand.js";

/** One desk panel a `layout` drive command can target. */
export interface DeskPanelInfo {
  readonly id: string;
  readonly title: string;
}

/**
 * The per-tab roster of DEFAULT-TREE desk panels — the ids a
 * `DriveCommandV1` `layout` command can actually target. Transport-neutral
 * so both the server persona (the model-facing roster) and the client
 * layout layer can consume one source; the client-core conformance test
 * (`defaultLayoutPort.rosterConformance.test.ts`) pins this against the
 * real layout trees, which the server may not import. Off-tree registered
 * panels (`credit-sell-side`, `eq-depth`, `eq-sectors`) are deliberately
 * absent — a maximize on one of those is a client-side no-op.
 */
export const DESK_PANEL_ROSTER: Record<DriveTab, readonly DeskPanelInfo[]> = {
  fx: [
    { id: "fx-rates", title: "Live Rates" },
    { id: "fx-blotter", title: "Blotter" },
    { id: "fx-analytics", title: "Analytics" },
    { id: "fx-positions", title: "Positions" },
  ],
  credit: [
    { id: "credit-new-rfq", title: "New RFQ" },
    { id: "credit-rfqs", title: "RFQs" },
    { id: "credit-blotter", title: "Credit Blotter" },
  ],
  equities: [
    { id: "eq-chart", title: "Equities" },
    { id: "eq-blotter", title: "Orders & Positions" },
    { id: "eq-ticket", title: "Order Ticket" },
    { id: "eq-watchlist", title: "Watchlist" },
  ],
  admin: [{ id: "admin-dashboard", title: "Admin" }],
};
```

Export from `packages/shared/src/index.ts` following the existing `driveCommand` export block (same barrel style).

- [ ] **Step 4: Shared test green**

Run: `pnpm --filter @rtc/shared test -- deskPanels` → PASS

- [ ] **Step 5: Write the client-core conformance test (the never-drift gate)**

```ts
// packages/client-core/src/layout/defaultLayoutPort.rosterConformance.test.ts
import { DESK_PANEL_ROSTER } from "@rtc/shared";
import { describe, expect, it } from "vitest";
import { PANEL_SPECS } from "./defaultLayoutPort.js";
import { LAYOUT_PANEL_IDS } from "../composition.js";

describe("DESK_PANEL_ROSTER ↔ defaultLayoutPort conformance", () => {
  it("roster ids per tab equal the default-tree ids (order included)", () => {
    for (const tab of ["fx", "credit", "equities", "admin"] as const) {
      expect(DESK_PANEL_ROSTER[tab].map((p) => p.id)).toEqual([...LAYOUT_PANEL_IDS[tab]]);
    }
  });

  it("roster titles match PANEL_SPECS titles", () => {
    for (const panels of Object.values(DESK_PANEL_ROSTER)) {
      for (const panel of panels) {
        expect(PANEL_SPECS[panel.id]?.title).toBe(panel.title);
      }
    }
  });
});
```

Adjust the `PANEL_SPECS` / `LAYOUT_PANEL_IDS` import paths to their real export sites (`PANEL_SPECS` is in `defaultLayoutPort.ts:17`; `LAYOUT_PANEL_IDS` is in `composition.ts:363-375` — if it is not exported, export it, it is a pure constant). If `LAYOUT_PANEL_IDS` derivation is inline in composition, prefer importing `collectPanelIds` + the tree roots from `defaultLayoutPort` directly — the test must compare against the same derivation the driver uses.

- [ ] **Step 6: Conformance test green; deliberately break it to prove teeth**

Run: `pnpm --filter @rtc/client-core test -- rosterConformance` → PASS.
Then temporarily change `"Live Rates"` to `"Live Ratez"` in `deskPanels.ts`, re-run → must FAIL, revert.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/jarvis/deskPanels.ts packages/shared/src/index.ts packages/shared/src/jarvis/__tests__/deskPanels.test.ts packages/client-core/src/layout/defaultLayoutPort.rosterConformance.test.ts
git commit -m "feat(shared): DESK_PANEL_ROSTER — dependency-legal panel id/title source, tree-conformance gated"
```

---

### Task 2: Persona panel-id roster + FX worked example

**Files:**
- Modify: `packages/server/src/agent/jarvisPersona.ts`
- Test: `packages/server/src/agent/jarvisPersona.test.ts`

**Interfaces:**
- Consumes: `DESK_PANEL_ROSTER` from `@rtc/shared` (Task 1).
- Produces: nothing downstream; the prompt text changes only.

- [ ] **Step 1: Update the persona tests first**

In `jarvisPersona.test.ts`:
1. Length guard (`:137-140`): upper bound `3_000` → `3_600`. Keep the lower bound.
2. `driveExampleLines` count (`:64-74`): `toHaveLength(2)` → `toHaveLength(3)`.
3. `allExampleLines` count (`:76-90`): `toHaveLength(4)` → `toHaveLength(5)`.
4. Add the derivation pin:

```ts
import { DESK_PANEL_ROSTER } from "@rtc/shared";

it("derives the panel roster from DESK_PANEL_ROSTER (never a hand-typed list)", () => {
  for (const [tab, panels] of Object.entries(DESK_PANEL_ROSTER)) {
    for (const panel of panels) {
      expect(JARVIS_SYSTEM_PROMPT).toContain(panel.id);
    }
    expect(JARVIS_SYSTEM_PROMPT).toContain(`${tab}:`);
  }
});

it("carries the FX maximize worked example", () => {
  expect(JARVIS_SYSTEM_PROMPT).toContain(
    '{kind: "layout", op: "maximize", tab: "fx", panelId: "fx-rates"}',
  );
});
```

- [ ] **Step 2: Run — FAIL (counts + roster missing)**

Run: `pnpm --filter @rtc/server test -- jarvisPersona`

- [ ] **Step 3: Implement**

In `jarvisPersona.ts`, add above the template (beside `PANEL_VIZ_KINDS_LIST`, same derivation doctrine):

```ts
import { DESK_PANEL_ROSTER } from "@rtc/shared";

/** Model-facing per-tab panel roster, derived from the shared constant
 * (never a hand-typed list — the doctrine `PANEL_VIZ_KINDS_LIST` set).
 * Format: `fx: fx-rates ("Live Rates"), fx-blotter ("Blotter"), …` */
const PANEL_ROSTER_LINES = Object.entries(DESK_PANEL_ROSTER)
  .map(([tab, panels]) => {
    const items = panels.map((p) => `${p.id} ("${p.title}")`).join(", ");
    return `${tab}: ${items}`;
  })
  .join("; ");
```

Then in the prompt, after the existing drive_app paragraph (L27) insert the roster sentence and the third worked example (keeping the two existing examples verbatim):

```
Layout panel ids per tab — ${PANEL_ROSTER_LINES}. Use these exact ids; any other id is silently ignored by the desk.
Example — drive, FX: maximise Live Rates → call drive_app with {commands: [{kind: "layout", op: "maximize", tab: "fx", panelId: "fx-rates"}]}.
```

- [ ] **Step 4: All persona tests green; print the length**

Run: `pnpm --filter @rtc/server test -- jarvisPersona` → PASS.
Also log `JARVIS_SYSTEM_PROMPT.length` once in the run (scratch assertion or `console.log` removed before commit) — confirm ≤3600 with real headroom (>100 chars); if not, tighten the roster sentence, not the examples.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/agent/jarvisPersona.ts packages/server/src/agent/jarvisPersona.test.ts
git commit -m "feat(server): persona panel-id roster + FX maximize example — closes the drive-targeting gap; guard 3600 (deliberate)"
```

---

### Task 3: The guide catalog + chip sampler (`client-core`)

**Files:**
- Create: `packages/client-core/src/presenters/jarvisGuideCatalog.ts`
- Test: `packages/client-core/src/presenters/jarvisGuideCatalog.test.ts`
- Modify: `packages/client-core/src/index.ts` (export both symbols + types)

**Interfaces:**
- Produces (Tasks 5/6/7/8 consume):

```ts
export interface JarvisGuideItem { readonly command: string; readonly liveOnly?: boolean; }
export interface JarvisGuideSection { readonly title: string; readonly items: readonly JarvisGuideItem[]; }
export const JARVIS_GUIDE_CATALOG: readonly JarvisGuideSection[];
export function sampleGuideChips(
  catalog: readonly JarvisGuideSection[],
  seed: number,
): readonly string[]; // exactly 4, one per section, non-liveOnly only
```

- [ ] **Step 1: Write the failing tests**

```ts
// packages/client-core/src/presenters/jarvisGuideCatalog.test.ts
import { matchJarvisIntent } from "@rtc/shared";
import { describe, expect, it } from "vitest";
import { JARVIS_GUIDE_CATALOG, sampleGuideChips } from "./jarvisGuideCatalog.js";

const KNOWN_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "EURGBP", "AUDUSD"];

describe("JARVIS_GUIDE_CATALOG", () => {
  it("has the four sections in display order", () => {
    expect(JARVIS_GUIDE_CATALOG.map((s) => s.title)).toEqual([
      "DESK INTELLIGENCE", "GENERATIVE UI", "DESK CONTROL", "EXECUTION",
    ]);
  });

  it("every non-liveOnly command resolves to a non-fallback scripted intent", () => {
    for (const section of JARVIS_GUIDE_CATALOG) {
      for (const item of section.items) {
        if (item.liveOnly) { continue; }
        const intent = matchJarvisIntent(item.command, KNOWN_SYMBOLS);
        expect(intent.kind, `"${item.command}" fell back`).not.toBe("fallback");
      }
    }
  });

  it("liveOnly rows exist only in DESK CONTROL", () => {
    for (const section of JARVIS_GUIDE_CATALOG) {
      const hasLive = section.items.some((i) => i.liveOnly === true);
      expect(hasLive).toBe(section.title === "DESK CONTROL");
    }
  });
});

describe("sampleGuideChips", () => {
  it("returns 4 commands, one from each section, none liveOnly", () => {
    const chips = sampleGuideChips(JARVIS_GUIDE_CATALOG, 1);
    expect(chips).toHaveLength(4);
    chips.forEach((chip, i) => {
      const section = JARVIS_GUIDE_CATALOG[i];
      const item = section.items.find((it) => it.command === chip);
      expect(item, `chip "${chip}" not in section ${section.title}`).toBeDefined();
      expect(item?.liveOnly).not.toBe(true);
    });
  });

  it("is deterministic per seed and rotates across seeds", () => {
    expect(sampleGuideChips(JARVIS_GUIDE_CATALOG, 1)).toEqual(sampleGuideChips(JARVIS_GUIDE_CATALOG, 1));
    const seeds = [1, 2, 3].map((s) => sampleGuideChips(JARVIS_GUIDE_CATALOG, s));
    expect(new Set(seeds.map((c) => c.join("|"))).size).toBeGreaterThan(1);
  });

  it("cycles within each section's non-liveOnly items", () => {
    const section = JARVIS_GUIDE_CATALOG[0];
    const pool = section.items.filter((i) => !i.liveOnly);
    const seen = new Set(
      Array.from({ length: pool.length }, (_, s) => sampleGuideChips(JARVIS_GUIDE_CATALOG, s + 1)[0]),
    );
    expect(seen.size).toBe(pool.length);
  });
});
```

(If `matchJarvisIntent` is not exported from the `@rtc/shared` barrel, export it — the scripted engine already imports it internally.)

- [ ] **Step 2: Run — FAIL**

Run: `pnpm --filter @rtc/client-core test -- jarvisGuideCatalog`

- [ ] **Step 3: Implement**

```ts
// packages/client-core/src/presenters/jarvisGuideCatalog.ts
export interface JarvisGuideItem {
  /** The literal text sent as a user turn when the row/chip is clicked. */
  readonly command: string;
  /** Only a live (LLM) brain can act on it; scripted answers with its
   * honest mandate fallback. Rendered as a "live brain" badge; excluded
   * from the chip sampler. */
  readonly liveOnly?: boolean;
}

export interface JarvisGuideSection {
  readonly title: string;
  readonly items: readonly JarvisGuideItem[];
}

/** One catalog feeds the chips, the ⓘ guide and the demo script — the
 * conformance test walks every non-liveOnly command through
 * `matchJarvisIntent`, so a line the scripted brain cannot parse fails CI. */
export const JARVIS_GUIDE_CATALOG: readonly JarvisGuideSection[] = [
  {
    title: "DESK INTELLIGENCE",
    items: [
      { command: "What's moving?" },
      { command: "Where is EURUSD?" },
      { command: "How am I doing?" },
      { command: "Brief me on the desk" },
      { command: "What's the spread on GBPUSD?" },
    ],
  },
  {
    title: "GENERATIVE UI",
    items: [
      { command: "Show me GBP volatility" },
      { command: "Show me a price chart" },
      { command: "Make it a heatmap" },
      { command: "Make it a table" },
    ],
  },
  {
    title: "DESK CONTROL",
    items: [
      { command: "Set up my morning workspace" },
      { command: "Maximise the Live Rates panel", liveOnly: true },
      { command: "Switch to the neon theme", liveOnly: true },
      { command: "Turn on power saver", liveOnly: true },
    ],
  },
  {
    title: "EXECUTION",
    items: [{ command: "Buy 5M EURUSD" }, { command: "Sell 2M GBPUSD" }],
  },
];

/** Four chips, one per section, rotating with `seed` (the overlay's
 * openCount) — deterministic so specs pin exact sets. liveOnly rows are
 * skipped: a chip is a one-click promise and must work on every brain. */
export function sampleGuideChips(
  catalog: readonly JarvisGuideSection[],
  seed: number,
): readonly string[] {
  return catalog.map((section, sectionIndex) => {
    const pool = section.items.filter((item) => {
      return item.liveOnly !== true;
    });
    const index = ((seed + sectionIndex) % pool.length + pool.length) % pool.length;
    return pool[index].command;
  });
}
```

Intent-hazard notes baked into the choices (from the matcher's cascade): "Brief me on the desk" → rule 1 `brief`; "What's the spread on GBPUSD?" → rule 3 (`spread` + symbol); "Show me GBP volatility" → `RULE_SHOW_PANEL_DIRECT` (`volatility`); "Make it a heatmap"/"table" → `RULE_RESTYLE_PANEL`; "Set up my morning workspace" → prefix+noun; "Buy 5M EURUSD"/"Sell 2M GBPUSD" → rule 2. A restyle click with no open panel gets the engine's honest `NO_PANEL_TO_RESTYLE_REPLY` — acceptable.

- [ ] **Step 4: Green**

Run: `pnpm --filter @rtc/client-core test -- jarvisGuideCatalog` → PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client-core/src/presenters/jarvisGuideCatalog.ts packages/client-core/src/presenters/jarvisGuideCatalog.test.ts packages/client-core/src/index.ts
git commit -m "feat(client-core): jarvis guide catalog + seeded chip sampler, intent-conformance gated"
```

---

### Task 4: `JarvisMachine` — `sendScripted` intent + `openCount`

**Files:**
- Modify: `packages/client-core/src/presenters/JarvisMachine.ts`
- Test: `packages/client-core/src/presenters/JarvisMachine.test.ts` (extend)
- Modify: `packages/ui-contract/src/visual/fixtures.ts` (JarvisState literals gain `openCount`)

**Interfaces:**
- Consumes: existing `JarvisAskOptions { brain; effort }` (both fields required).
- Produces (Task 5 consumes): `JarvisIntents.sendScripted: (text: string) => void`; `JarvisState.openCount: number` (0 in `INITIAL`; increments on every transition closed→open, whether via `open()` or `toggle()`).

- [ ] **Step 1: Failing tests**

Add to `JarvisMachine.test.ts` (follow the file's existing harness — the controllable fake port and marble/subject drivers already there):

```ts
it("openCount increments on open() and opening toggle(), not on close()", () => {
  // machine starts closed, openCount 0
  machine.intents.open();
  expect(current().openCount).toBe(1);
  machine.intents.close();
  expect(current().openCount).toBe(1);
  machine.intents.toggle(); // closed → open
  expect(current().openCount).toBe(2);
  machine.intents.toggle(); // open → closed
  expect(current().openCount).toBe(2);
});

it("sendScripted asks with brain 'scripted' regardless of the effective brain", () => {
  // availability offers haiku; preference haiku — effectiveBrain is haiku
  machine.intents.sendScripted("Where is EURUSD?");
  expect(fakePort.lastAskOptions).toEqual({ brain: "scripted", effort: expect.any(String) });
});

it("send still asks with the effective brain after a sendScripted turn", () => {
  machine.intents.sendScripted("Where is EURUSD?");
  completeTurn(); // drive the fake ask observable to completion
  machine.intents.send("What's moving?");
  expect(fakePort.lastAskOptions?.brain).toBe("claude-haiku-4-5");
});
```

Adapt accessor names (`current()`, `fakePort.lastAskOptions`, `completeTurn()`) to the file's real helpers — the suite already asserts on `port.ask` calls for brain routing (the governance tests do exactly this); extend that fake to record `options`.

- [ ] **Step 2: Run — FAIL**

Run: `pnpm --filter @rtc/client-core test -- JarvisMachine`

- [ ] **Step 3: Implement**

1. `JarvisState`: add `readonly openCount: number;` (doc: "times the overlay has been opened this session — the chip-rotation seed"). `INITIAL`: `openCount: 0`.
2. `openPatches$`: `{ ...s, open: true, unread: 0, unreadNarration: 0, openCount: s.open ? s.openCount : s.openCount + 1 }` — mirror whatever the existing open patch does with unread, adding the guarded increment; same in `togglePatches$`'s opening branch only.
3. `JarvisIntents`: add `sendScripted: (text: string) => void;` (doc: "queue a turn pinned to the scripted brain — the demo's send; the user's brain preference is untouched"). Wire a `sendScripted$` subject into the same turn-request queue `send$` feeds, tagging the request (e.g. `kind: "sendScripted"`).
4. At the single ask call site (L607): `deps.port.ask(wireText, { brain: req.kind === "sendScripted" ? "scripted" : effectiveBrain, effort })`. Entries stay ordinary user turns (`origin` untouched).

- [ ] **Step 4: Green + fixtures**

Run: `pnpm --filter @rtc/client-core test -- JarvisMachine` → PASS.
Then add `openCount: 1` to every `JarvisState` literal in `packages/ui-contract/src/visual/fixtures.ts` (~4 sites near L2205–2293) — `1`, not `0`, so fixture-rendered overlays show the seed-1 chip set. Run `pnpm --filter @rtc/ui-contract build` (or typecheck) to catch missed literals; `pnpm typecheck` across the repo catches any others.

- [ ] **Step 5: Commit**

```bash
git add packages/client-core/src/presenters/JarvisMachine.ts packages/client-core/src/presenters/JarvisMachine.test.ts packages/ui-contract/src/visual/fixtures.ts
git commit -m "feat(client-core): sendScripted intent + openCount chip seed on JarvisMachine"
```

---

### Task 5: `JarvisDemoMachine` + composition + bindings

**Files:**
- Create: `packages/client-core/src/presenters/JarvisDemoMachine.ts`
- Test: `packages/client-core/src/presenters/JarvisDemoMachine.test.ts`
- Modify: `packages/client-core/src/composition.ts` (singleton + `Presenters` member)
- Modify: `packages/react-bindings/src/createViewModel.ts`, `packages/solid-bindings/src/createViewModel.ts`
- Modify: `packages/client-core/src/index.ts` (types)

**Interfaces:**
- Consumes: `JARVIS_GUIDE_CATALOG` (Task 3), `sendScripted`/`declineConfirmation`/`open`/`close` intents + `state$` (Task 4), `powerSaver.level$`.
- Produces:

```ts
export interface JarvisDemoState {
  readonly running: boolean;
  readonly stepIndex: number;   // 1-based while running, 0 idle
  readonly stepCount: number;   // static
  readonly label: string | null;
}
export interface JarvisDemoIntents {
  readonly startDemo: () => void;
  readonly stopDemo: () => void;
}
export interface JarvisDemoMachineHandle {
  readonly state$: StateObservable<JarvisDemoState>;
  readonly intents: JarvisDemoIntents;
}
export function createJarvisDemoMachine(deps: JarvisDemoDeps): JarvisDemoMachineHandle;

export interface JarvisDemoDeps {
  readonly jarvisState$: Observable<JarvisState>;
  readonly jarvis: Pick<JarvisIntents, "open" | "close" | "sendScripted" | "declineConfirmation">;
  readonly powerSaverLevel$: Observable<PowerSaverLevel>;
  readonly scheduler?: SchedulerLike;
}
export const DEMO_STEP_BEAT_MS = 1200;
export const JARVIS_DEMO_STEPS: readonly { label: string; command: string; closesOverlay?: boolean }[];
```

**The script** (derived from catalog commands at module scope — reference `JARVIS_GUIDE_CATALOG` entries by lookup, do not re-type the strings; a helper `guideCommand(sectionTitle, index)` that throws on a miss keeps it honest):

| # | label | command | notes |
|---|---|---|---|
| 1 | `DESK BRIEFING` | "Brief me on the desk" | |
| 2 | `MARKET INTEL` | "Where is EURUSD?" | |
| 3 | `MARKET INTEL` | "What's moving?" | |
| 4 | `GENERATIVE UI` | "Show me GBP volatility" | spawns the live panel |
| 5 | `GENERATIVE UI` | "Make it a heatmap" | restyles it (must follow #4 — engine `lastPanel`) |
| 6 | `EXECUTION` | "Buy 5M EURUSD" | wait for `pendingConfirmation !== null`, hold one beat, `declineConfirmation()` |
| 7 | `MORNING WORKSPACE` | "Set up my morning workspace" | `closesOverlay: true` — close first so the drive is visible; reopen after the turn settles + one beat. Runs LAST (deviation 7). |

**Fold mechanics:**
- `startDemo()` while running is a no-op; while idle: `jarvis.open()`, then iterate steps with `concatMap`.
- Per step: (`closesOverlay` → `jarvis.close()`), `jarvis.sendScripted(command)`, then **await turn completion by observing `jarvisState$`**: the turn is settled when `phase` transitions `"speaking"` → `"idle"` (`pairwise()` + `filter`); for step 6, first await `pendingConfirmation !== null`, delay one beat on the injected scheduler, call `declineConfirmation()`, then await the settle. After settle: `delay(beat, scheduler)` where `beat = level === "freeze" ? 0 : DEMO_STEP_BEAT_MS` (read `powerSaverLevel$` fresh per step via `withLatestFrom` — the P5 pattern).
- After step 7 settles: `jarvis.open()`, state returns to idle (`running: false, stepIndex: 0, label: null`).
- `stopDemo()`: interrupts the chain immediately (`takeUntil(stop$)`); state → idle. In-flight scripted turn is left to finish naturally (it is zero-cost and the machine must not cancel a turn mid-stream). If a confirm card is pending at stop, decline it (never leave a dangling 60s card).
- A turn `error` settles the step the same as done (observe `phase` only) — but if `entries` last error flag is set, abort the remaining steps to idle (spec §6 error posture). Simplest honest read: watch the settle; on settle check the last entry's `error` flag; abort if true.
- Handle is a session-lifetime singleton like `jarvisDriver` — **no dispose** (same doctrine comment).

- [ ] **Step 1: Failing tests (TestScheduler)**

Model on `JarvisDriverMachine.test.ts`'s harness (subjects for deps, TestScheduler injection). Cases:

```ts
it("plays all 7 steps in order, one sendScripted per settle, with 1200ms beats");
it("beat is 0 under freeze");
it("step 6 waits for the confirm card, declines it after one beat, never approves");
it("step 7 closes the overlay before sending and reopens after settling");
it("stopDemo mid-run returns to idle and declines any pending card");
it("startDemo while running is a no-op (single chain)");
it("an errored turn aborts the remaining steps to idle");
it("progress state exposes 1-based stepIndex, stepCount 7 and the step label");
```

Each with concrete subject pushes: `jarvisState$.next({ ...base, phase: "speaking" })` then `...idle` to settle a step; assert `deps.jarvis.sendScripted` calls (a `vi.fn()`) in exact order with the catalog strings.

- [ ] **Step 2: Run — FAIL**

Run: `pnpm --filter @rtc/client-core test -- JarvisDemoMachine`

- [ ] **Step 3: Implement the machine** (per the mechanics above; keep the fold in one file, pure helpers for the step list and beat selection).

- [ ] **Step 4: Green**

Run: `pnpm --filter @rtc/client-core test -- JarvisDemoMachine` → PASS

- [ ] **Step 5: Composition + bindings**

`composition.ts` — after the `jarvisDriver` block (L657–690), same style:

```ts
const jarvisDemo = createJarvisDemoMachine({
  jarvisState$: jarvis.state$,
  jarvis: jarvis.intents,
  powerSaverLevel$: powerSaver.level$,
});
```

Add `jarvisDemo: JarvisDemoMachineHandle` to `Presenters` (doc comment naming the singleton doctrine) and the return literal. Bindings, both files, following `useJarvis`'s state+intents pattern exactly:
- react interface: `useJarvisDemo: () => { state: JarvisDemoState; startDemo: () => void; stopDemo: () => void };` impl `{ state: useStateObservable(presenters.jarvisDemo.state$), ...presenters.jarvisDemo.intents }`.
- solid: same shape with `state: Accessor<JarvisDemoState>` via `toSignal`.

Run: `pnpm --filter @rtc/client-core test && pnpm --filter @rtc/react-bindings test && pnpm --filter @rtc/solid-bindings test` → PASS (bindings suites have accessor-coverage tests that will flag the new member if the pattern demands wiring — follow their failures).

- [ ] **Step 6: Commit**

```bash
git add packages/client-core/src/presenters/JarvisDemoMachine.ts packages/client-core/src/presenters/JarvisDemoMachine.test.ts packages/client-core/src/composition.ts packages/client-core/src/index.ts packages/react-bindings/src/createViewModel.ts packages/solid-bindings/src/createViewModel.ts
git commit -m "feat(client-core): JarvisDemoMachine — hands-free scripted demo over the real machine"
```

---

### Task 6: React UI — guide panel, footer entries, rotating chips

**Files:**
- Modify: `packages/client-react/src/ui/shell/jarvis/JarvisOverlay.tsx`
- Modify: `packages/client-react/src/ui/shell/jarvis/JarvisOverlay.module.css`

**Interfaces:**
- Consumes: `JARVIS_GUIDE_CATALOG`, `sampleGuideChips` (Task 3), `state.openCount` (Task 4), `useJarvisDemo` (Task 5).

- [ ] **Step 1: Rotating chips**

Delete the `SUGGESTIONS` constant (both the array and its comment). Replace the chips render source:

```tsx
const chips = sampleGuideChips(JARVIS_GUIDE_CATALOG, state.openCount);
```

The row markup, testid `jarvis-suggestion`, `disabled={speaking}`, and `submit(text)` handler are unchanged.

- [ ] **Step 2: Guide panel + toggles**

Local view state (presentation-local per ADR-005/spec §4): `const [guideOpen, setGuideOpen] = useState(false);` with an effect-named handler `toggleGuide`. Two entry points:

1. ⓘ button beside ✕ — INSIDE `.stage` after the close button (the page object reads `data-skin` off the overlay's first element child `.stage`; do not add siblings before it):

```tsx
<button type="button" data-testid="jarvis-guide-toggle" aria-label="Demo guide"
        aria-pressed={guideOpen} className={styles.guideToggle} onClick={toggleGuide}>ⓘ</button>
```

2. Footer entry (a `.hint`-styled button) after the skin switch: label `ⓘ DEMO GUIDE`, same `toggleGuide`, no separate testid (the panel + ⓘ toggle carry the contract).

Panel, rendered inside `.stage` when `guideOpen` (sibling after the messages column, absolutely positioned right):

```tsx
{guideOpen ? (
  <aside data-testid="jarvis-guide-panel" className={styles.guidePanel} aria-label="Demo guide">
    <div className={styles.guideHead}>
      <span>DEMO GUIDE</span>
      <button type="button" aria-label="Close demo guide" className={styles.guideClose} onClick={toggleGuide}>✕</button>
    </div>
    <div className={styles.guideBody}>
      <button type="button" data-testid="jarvis-guide-run" className={styles.guideRun}
              disabled={demo.state.running} onClick={startDemo}>▶ RUN FULL DEMO · HANDS-FREE</button>
      <p className={styles.guideExplainer}>Every line below is a live command — click one to send it to J.A.R.V.I.S.</p>
      {JARVIS_GUIDE_CATALOG.map((section) => (
        <div key={section.title} className={styles.guideSection}>
          <div className={styles.guideSectionTitle}>{section.title}</div>
          {section.items.map((item) => (
            <button key={item.command} type="button" data-testid="jarvis-guide-row"
                    className={styles.guideRow} disabled={speaking}
                    onClick={() => submit(item.command)}>
              {item.command}
              {item.liveOnly ? (
                <span data-testid="jarvis-guide-live-badge" className={styles.guideLiveBadge}>live brain</span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
      <div className={styles.guideTips}>
        <p>⌘J summons J.A.R.V.I.S from anywhere; ESC dismisses.</p>
        <p>▶ RUN FULL DEMO plays the desk hands-free; ■ STOP or any message halts it.</p>
        <p>Generated panels stay live after the conversation ends.</p>
      </div>
    </div>
  </aside>
) : null}
```

- [ ] **Step 3: Footer demo affordances**

```tsx
const { state: demoState, startDemo, stopDemo } = useJarvisDemo();
```

In the footer, before the skin switch: idle → `<button data-testid="jarvis-demo-run" className={styles.demoRun} onClick={startDemo}>▶ RUN FULL DEMO</button>`; running → `<span data-testid="jarvis-demo-progress" className={styles.demoProgress}>STEP {demoState.stepIndex}/{demoState.stepCount} · {demoState.label}</span><button data-testid="jarvis-demo-stop" className={styles.demoStop} onClick={stopDemo}>■ STOP</button>`.

Halt-on-user-action wiring (plan ruling — the machine cannot see UI events): in `submit()` add `if (demoState.running) { stopDemo(); }` before `send(trimmed)`; in the ESC path of `useJarvisHotkey`/close handling, call `stopDemo()` when running before `close()` (read the hook — if ESC routes through `close`, wrap the overlay's `close` usage in a `closeAndStopDemo` handler passed where `close` was used).

- [ ] **Step 4: CSS**

Add to `JarvisOverlay.module.css` (compositor-safe: no animated properties beyond `transform`/`opacity`; static layout only): `.guideToggle` (mirrors `.closeButton`, offset `right: 62px`), `.guidePanel` (absolute, `top: 60px; right: 20px; bottom: 88px; width: 314px;` panel background/border per the existing `.stage` palette vars, `overflow: hidden; display: flex; flex-direction: column;`), `.guideHead`, `.guideBody` (`overflow-y: auto;`), `.guideRun`, `.guideExplainer`, `.guideSection`, `.guideSectionTitle`, `.guideRow` (full-width text-left button, `.hint`-adjacent typography), `.guideLiveBadge` (small muted uppercase), `.guideTips`, `.demoRun`, `.demoProgress`, `.demoStop` (footer-hint scale). Reuse existing custom properties — no new hex literals if an existing var fits.

- [ ] **Step 5: Manual smoke**

Run: `pnpm dev` → open Jarvis (⌘J) → chips differ across two open/close cycles; ⓘ opens the guide; a guide row click sends; RUN FULL DEMO plays through (watch the workspace finale drive the app) and ■ STOP halts. Fix what's broken.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react/src/ui/shell/jarvis/JarvisOverlay.tsx packages/client-react/src/ui/shell/jarvis/JarvisOverlay.module.css
git commit -m "feat(client-react): jarvis demo guide panel, footer demo controls, rotating hint chips"
```

---

### Task 7: Solid UI — byte-identical mirror

**Files:**
- Modify: `packages/client-solid/src/ui/shell/jarvis/JarvisOverlay.tsx`
- Modify: `packages/client-solid/src/ui/shell/jarvis/JarvisOverlay.module.css`

**Interfaces:** same as Task 6.

- [ ] **Step 1: Port the TSX** — same structure with Solid idiom (the file's own conventions, documented in its header): `state().openCount`, `createSignal` for `guideOpen`, `createMemo` for `chips` (avoid the dead-arm branch trap the gate round hit — a memo, not an inline ternary), `<Show>`/`<For>` instead of ternaries/`.map`, `class=` not `className=`, `demo.state()` accessor reads.

- [ ] **Step 2: Copy the CSS verbatim** — `cp` the react module over the solid module (they are byte-identical today; keep them so).

Run: `diff packages/client-react/src/ui/shell/jarvis/JarvisOverlay.module.css packages/client-solid/src/ui/shell/jarvis/JarvisOverlay.module.css` → empty.

- [ ] **Step 3: Manual smoke**

Run: `pnpm dev:solid` → same checklist as Task 6 Step 5.

- [ ] **Step 4: Commit**

```bash
git add packages/client-solid/src/ui/shell/jarvis/JarvisOverlay.tsx packages/client-solid/src/ui/shell/jarvis/JarvisOverlay.module.css
git commit -m "feat(client-solid): jarvis demo guide + demo controls + rotating chips — react parity"
```

---

### Task 8: Contract specs, page objects, visual scenario

**Files:**
- Modify: `packages/ui-contract/src/shared/pages/shell/jarvis/JarvisOverlayPage.ts`
- Modify: `packages/ui-contract/src/specs/shell/jarvis/JarvisOverlay.contract.spec.ts`
- Modify: `packages/ui-contract/src/visual/scenarios.ts`, `packages/ui-contract/src/visual/fixtures.ts`, `packages/ui-contract/src/visual/scenarioActions.ts`

**Interfaces:**
- Consumes: testids from Tasks 6/7; `sampleGuideChips` for expected sets; the world's real `createJarvisMachine` (the demo machine is NOT in the contract world — demo progress/stop rendering is covered by driving the overlay against a world extension, see Step 1 note).

- [ ] **Step 1: Page-object accessors**

Add to `JarvisOverlayPage` (same `within(this.root)`/`requireOverlay` style as `suggestions()`):

```ts
toggleGuide(): Promise<void>            // clicks jarvis-guide-toggle
isGuideOpen(): boolean                  // jarvis-guide-panel present
guideSectionTitles(): string[]
guideRows(): string[]                   // row labels in render order (badge text excluded)
clickGuideRow(command: string): Promise<void>
liveBadgedRows(): string[]              // rows carrying jarvis-guide-live-badge
runDemoFromGuide(): Promise<void>       // clicks jarvis-guide-run
runDemoFromFooter(): Promise<void>      // clicks jarvis-demo-run
demoProgressText(): string | null       // jarvis-demo-progress text or null
stopDemo(): Promise<void>               // clicks jarvis-demo-stop
```

**World note:** the contract world builds the real `JarvisMachine` but not the demo machine. Extend the world the same way `jarvis` is built (`world.ts` L776–801 pattern): construct the real `createJarvisDemoMachine` over the world's jarvis machine (`jarvisState$: world.jarvis.machine.state$`, `jarvis: world.jarvis.machine.intents`, `powerSaverLevel$: of("off")`) and expose it so `viewModelFromWorld` can hand `useJarvisDemo` to both registries. Both per-client `viewModelFromWorld` implementations (react/solid contract harnesses) gain the accessor — follow how `useJarvisDriver` was added there (grep for it in both harness files).

- [ ] **Step 2: Contract cases (all in the existing spec file, new `describe("demo guide")` / `describe("rotating chips")` / `describe("full demo")` blocks)**

```ts
it("chips render the sampleGuideChips set for the current openCount", async () => {
  // first open → openCount 1
  expect(overlay.suggestions()).toEqual([...sampleGuideChips(JARVIS_GUIDE_CATALOG, 1)]);
});

it("chips rotate on the next open", async () => {
  await overlay.pressHotkey(); // close
  await overlay.pressHotkey(); // reopen → openCount 2
  expect(overlay.suggestions()).toEqual([...sampleGuideChips(JARVIS_GUIDE_CATALOG, 2)]);
});

it("ⓘ toggles the guide panel with every catalog section and row", async () => {
  await overlay.toggleGuide();
  expect(overlay.isGuideOpen()).toBe(true);
  expect(overlay.guideSectionTitles()).toEqual(JARVIS_GUIDE_CATALOG.map((s) => s.title));
  expect(overlay.guideRows()).toEqual(
    JARVIS_GUIDE_CATALOG.flatMap((s) => s.items.map((i) => i.command)),
  );
});

it("liveOnly rows carry the live-brain badge, others do not", async () => {
  await overlay.toggleGuide();
  const expected = JARVIS_GUIDE_CATALOG.flatMap((s) =>
    s.items.filter((i) => i.liveOnly === true).map((i) => i.command));
  expect(overlay.liveBadgedRows()).toEqual(expected);
});

it("clicking a guide row sends its exact command as a user turn", async () => {
  await overlay.toggleGuide();
  await overlay.clickGuideRow("Where is EURUSD?");
  // same assertion shape as the existing suggestion-click case: last user entry text
});

it("starting the demo shows STEP progress and ■ STOP; stop returns the ▶ entry", async () => {
  await overlay.runDemoFromFooter();
  expect(overlay.demoProgressText()).toMatch(/^STEP 1\/7 · /);
  await overlay.stopDemo();
  expect(overlay.demoProgressText()).toBeNull();
});

it("a manual send while the demo runs halts it", async () => {
  await overlay.runDemoFromFooter();
  await overlay.send("Where is EURUSD?");
  expect(overlay.demoProgressText()).toBeNull();
});
```

The two existing suggestion cases (`clicking a suggestion chip sends its exact text`, disabled-while-speaking) are already content-agnostic — leave them untouched. The world's fake port answers `ask` with a controllable stream; the demo's first `sendScripted` reaches the same fake port, so step 1 stays in-flight (phase "speaking") — exactly what the progress assertions need. Run both clients:

Run: `pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-solid test:ui:contract` → green, then the coverage variants (`test:ui:contract:coverage`) — new branches must keep react ≥95%, solid ≥95%/85%.

- [ ] **Step 3: Visual scenario**

1. `scenarios.ts`: `"jarvis/overlay-guide": { componentKey: "JarvisOverlay", fixtureKey: "jarvis-chat" }` (reuse the chat fixture — the guide overlays it).
2. `scenarioActions.ts`: `"jarvis/overlay-guide": { fullPage: true, click: "jarvis-guide-toggle", waitForText: "DEMO GUIDE" }` (follow the exact option names the file's existing click/wait recipes use — read two neighbors first).
3. No fixture/registry edits (existing componentKey + fixture; `openCount: 1` landed in Task 4).

Run the react visual tier locally per the worktree recipe (build first, direct binary path) for the new scenario only: expect 10 new failing-golden shots — that is the regen dispatch's job (Task 10), not local commits. Just verify the scenario renders (screenshot exists, guide visible) via `--update-snapshots` into a scratch dir or the `-g "overlay-guide"` filter, without committing local-platform goldens.

- [ ] **Step 4: Commit**

```bash
git add packages/ui-contract/src
git commit -m "test(ui-contract): guide panel + rotating chips + demo progress specs; overlay-guide visual scenario"
```

---

### Task 9: E2e rides (plain Playwright, existing jarvis pattern)

**Files:**
- Modify: `tests/browser/page-objects/contracts/Jarvis.ts` + `tests/browser/page-objects/playwright/Jarvis.ts`
- Modify: `tests/browser/scenarios/jarvis.ts`
- Modify: `tests/browser/playwright/jarvis.spec.ts`

**Interfaces:**
- Consumes: testids from Task 6/7; scripted reply fragments already pinned in `scenarios/jarvis.ts`.

- [ ] **Step 1: PO contract + driver additions**

Contract: `openGuide()`, `clickGuideCommand(text)`, `startFullDemo()`, `demoProgress(): Promise<string | null>`, `stopFullDemo()`, `waitForDemoStep(n: number)` (polls `jarvis-demo-progress` text for `STEP ${n}/`). Playwright driver implements via the testids. (The grep-gated page-object contract check runs in the fast gauntlet — keep contract and driver in sync.)

- [ ] **Step 2: Scenarios**

```ts
export async function expectGuideCommandRoundTrip(ctx: ScenarioContext): Promise<void> {
  await ctx.po.jarvis.openViaOrb();
  await ctx.po.jarvis.openGuide();
  await ctx.po.jarvis.clickGuideCommand("Where is EURUSD?");
  await ctx.po.jarvis.waitForReplyDone();
  assertContains(await ctx.po.jarvis.lastReplyText(), QUOTE_REPLY_FRAGMENT);
}

export async function expectFullDemoStartsAndStops(ctx: ScenarioContext): Promise<void> {
  await ctx.po.jarvis.openViaOrb();
  await ctx.po.jarvis.startFullDemo();
  await ctx.po.jarvis.waitForDemoStep(2);   // proves step 1 completed end-to-end
  await ctx.po.jarvis.stopFullDemo();
  assertEquals(await ctx.po.jarvis.demoProgress(), null);
}
```

The full 7-step run is machine-tier coverage (Task 5); e2e proves boot-to-browser wiring only — `waitForDemoStep(2)` is the cheapest witness that a real scripted turn settled and the fold advanced.

- [ ] **Step 3: Spec cases**

Two new tests in `test.describe("Jarvis assistant")`, `test.setTimeout(45_000)` on the demo one (typed-reveal pacing: step 1's reply alone runs seconds at 26ms/chunk).

- [ ] **Step 4: Run locally**

Run: `pnpm test:e2e` (or the jarvis suite directly per `run-all.ts`'s invocation) → green on both clients.

- [ ] **Step 5: Commit**

```bash
git add tests/browser
git commit -m "test(e2e): jarvis guide round-trip + full-demo start/stop rides"
```

---

### Task 10: Docs, close-out, ship prep

**Files:**
- Modify: `docs/STATUS.md` (flip the 🔴 entry → shipped receipt at merge time, per the tracking skill)
- Modify: `docs/superpowers/specs/2026-08-09-jarvis-discoverability-design.md` (record the 8 plan deviations as an addendum, the governance-round precedent)
- Verify: `docs/IDEAS.md` still carries only the GenUI riffs in the Jarvis section

- [ ] **Step 1: Spec addendum** — append a short "Plan-time deviations (2026-08-09)" section mirroring this plan's deviation list (1-line each).
- [ ] **Step 2: STATUS flip** — rewrite the 🔴 discoverability entry as the shipped line (PR number, date, one-paragraph receipt, deferred findings from reviews), delete it from 🔴, place under the Jarvis umbrella entry's tail like prior rounds. Bump `Last updated`.
- [ ] **Step 3: Full gauntlet** — `/rtc:gauntlet full` equivalent: fast tier + typecheck + tests + both contract coverage gates + build + devtools-dist. All green before push.
- [ ] **Step 4: Goldens** — after push + PR: dispatch `update-visual-goldens --ref <branch>` (x86 set; auto-commits `[skip ci]` — CI must then run on the post-golden SHA; a conflicting PR gets NO run: merge main in first if needed). The ~30 moved overlay goldens + 10 new `overlay-guide` shots land here.
- [ ] **Step 5: Ship** — per shipping-repo-changes: CI green on final SHA → Rule 3 triage → merge `--merge` → CodeQL check → cleanup.

---

## Self-review (done at write time)

- **Spec coverage:** §3 catalog → T3 (+T1 for the roster's home); §4 guide → T6/T7/T8; §5 chips → T3/T4/T6/T7/T8; §6 demo → T5 (+T4's intent); §7 persona → T1/T2; §8 testing → T1/T2/T3/T5/T8/T9; §9 out-of-scope honored (no RN, no voice, no teasers). Every §8 bullet has a home except "Gherkin", replaced per deviation 4.
- **Placeholders:** none — every step carries code or an exact recipe; UI steps name testids, classes, handlers.
- **Type consistency:** `sendScripted(text)` (T4) matches T5's deps and T6's usage; `JarvisDemoState`/`startDemo`/`stopDemo` consistent across T5/T6/T8; `DESK_PANEL_ROSTER` name identical in T1/T2; `sampleGuideChips(catalog, seed)` arity consistent in T3/T6/T8.
- **Known risks for reviewers:** the `phase`-transition settle detection (T5) must not double-fire on narrator turns arriving mid-demo (narrator is default-off in e2e but on in dev — the settle observer must key on transitions after ITS OWN send; if flaky, key on `entries` growth + `done` flag of the entry created after the send). Flag this to the T5 implementer and reviewer explicitly.
