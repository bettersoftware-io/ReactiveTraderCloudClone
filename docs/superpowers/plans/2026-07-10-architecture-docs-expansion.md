# Architecture Docs Expansion ("Codebase Atlas") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the orientation layer over the architecture reference: four new doc sections (§13 Codebase Map, §14 Composition & Wiring, §15 Flows, §16 Trailheads), an expanded §10, a README in every package, a "how to read this" hub, and a CI-enforced docs link checker.

**Architecture:** Documentation-only PR plus one ~70-line Node script and one CI step. All deliverables are disjoint files; content tasks are parallelizable once the anchor contract (below) is fixed. Spec: `docs/superpowers/specs/2026-07-10-architecture-docs-expansion-design.md` — read it before any task.

**Tech Stack:** GitHub-flavored Markdown, Mermaid (validated via the Mermaid MCP tool), SMIL-animated SVG (optional, where motion clarifies), Node ≥26 ESM script, `github-slugger` (root dev-dep).

## Global Constraints

- **Branch/worktree:** all work happens on `worktree-architecture-docs-expansion` (already created). One PR at the end; the user reviews before merge. Never touch `main`.
- **Truthfulness:** every named file, symbol, and snippet MUST be verified against the working tree at write time (`ls`, `Read`, `grep`). Cite `path:line` in your task report (not in the doc prose). Never write code samples from memory.
- **Anti-drift:** describe roles and boundaries, not volatile counts. Exhaustive listings ONLY for inventory folders: `packages/domain/src/ports/`, `packages/domain/src/simulators/`, `packages/server/src/effects/`.
- **Mermaid discipline:** §2 palette (blue UI `#4a7fd4`-family / purple bindings / green core / amber server+effects / slate domain+shared / gray actors — copy exact hex values from existing blocks in `docs/architecture/02-c4-model.md`), saturated fills + white text (dark-theme-safe), ≤5 sibling boxes per rank (split wide diagrams), quote pipe labels containing `()` (`-->|"createApp(ports)"|`). Validate EVERY block with `mcp__claude_ai_Mermaid_Chart__validate_and_render_mermaid_diagram` before commit. Known false-failure: classDiagram with zero relationship edges.
- **Animated SVGs:** optional, wherever motion helps. Follow the conventions of `docs/architecture/tick-journey.svg`: SMIL, `repeatCount="indefinite"`, `keyPoints`/`keyTimes` loops (absolute `begin` fires once — don't use it for loops).
- **Anchors:** heading text determines GitHub slugs; ` -- ` → four dashes, ` & ` → two. The Anchor Contract below is FROZEN — do not reword those headings. New cross-links must use targets from it or from existing files (verify with the checker).
- **Style:** match the voice of the existing sections (second person sparingly, bold lead-ins, tables for enumerable facts). Em-dash convention in headings is ` -- ` (two hyphens), matching §1–§12.
- **Commits:** one commit per task minimum, message style `docs(atlas): <what>` (script/CI task: `feat(docs): …`). Include the standard trailers:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and the Claude-Session URL used by this session's earlier commits (copy from `git log`).
- **Verification per content task:** (a) Mermaid MCP validation of each new block, (b) `node scripts/check-doc-links.mjs` passes (after Task 1 lands; before that, eyeball links against the Anchor Contract), (c) files you cite exist (`ls` each).

### Anchor Contract (frozen heading text → slug)

| File | H2 heading (exact) | Slug |
|---|---|---|
| `docs/architecture/13-codebase-map.md` | `## 13. Codebase Map` | `#13-codebase-map` |
| ↳ | `### 13.1 L0 -- The System On One Screen` | `#131-l0----the-system-on-one-screen` |
| ↳ | `### 13.2 L1 -- The Package Line Map` | `#132-l1----the-package-line-map` |
| ↳ | `### 13.3 L2 -- Module Maps` | `#133-l2----module-maps` |
| ↳ | `### 13.4 The Reuse Matrix` | `#134-the-reuse-matrix` |
| `docs/architecture/14-composition-and-wiring.md` | `## 14. Composition & Wiring` | `#14-composition--wiring` |
| ↳ | `### 14.1 The Composition Root` | `#141-the-composition-root` |
| ↳ | `### 14.2 Adapter Tables Per App` | `#142-adapter-tables-per-app` |
| ↳ | `### 14.3 Boot Sequences` | `#143-boot-sequences` |
| `docs/architecture/15-flows.md` | `## 15. Flows` | `#15-flows` |
| ↳ | `### 15.1 Control Flow vs Imports vs Data Flow` | `#151-control-flow-vs-imports-vs-data-flow` |
| `docs/architecture/16-trailheads.md` | `## 16. Trailheads` | `#16-trailheads` |
| `docs/architecture/10-key-design-decisions.md` | (existing H2 unchanged) | `#10-key-design-decisions` |

Package READMEs are linked by file path only (no anchors): `packages/<name>/README.md`.

### Package README Template (used verbatim by Tasks 8–16)

```markdown
# @rtc/<name>

<One-sentence purpose.>

| | |
|---|---|
| **Ring** | <ring per docs/architecture/01-overview.md §1.3.1, e.g. "① Domain — the yolk"> |
| **Runtime deps** | <list + the policy, e.g. "`rxjs` only — the single permitted exception, enforced by pnpm strict mode"> |
| **Consumed by** | <packages that import this one> |
| **Must never import** | <boundary rules + enforcing gate numbers from docs/architecture/12-architectural-gates.md> |

## Folder map

| Path | What lives here |
|---|---|
| `src/<folder>/` | <one-liner: role, not inventory> |

## Where to start reading

1. `src/<file>` — <why first>
2. …(2–4 entries)

## How it's used

<Short REAL snippet from an actual consumer file, cited in your task report.>

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- <relevant §15 flows / §16 trailheads>
```

(For app packages with existing READMEs, the template sections are ADDED around existing content — nothing deleted; put the identity card first, keep operational content under its current headings.)

---

### Task 1: Docs link checker — script, root script, CI step

**Files:**
- Create: `scripts/check-doc-links.mjs`
- Modify: `package.json` (root — add `check:doc-links` script + `github-slugger` dev-dep)
- Modify: `.github/workflows/ci.yml` (add step to the `checks` job after "Workflow lint (actionlint)")

**Interfaces:**
- Produces: `pnpm check:doc-links` → exit 0 when every relative md link/anchor in scope resolves; non-zero with `file:line broken-target` lines otherwise. Scope: `README.md`, `CLAUDE.md`, `docs/**/*.md`, `tests/**/*.md`, `packages/*/README.md`.
- Consumes: nothing from other tasks (content tasks consume this checker).

- [ ] **Step 1: Add the dev-dep** — `pnpm add -D -w github-slugger` (repo's `minimumReleaseAge` handles the 24h cooldown; if it refuses the latest, accept the version it resolves). Confirm `pnpm why github-slugger` shows it at the root only.
- [ ] **Step 2: Write the script** at `scripts/check-doc-links.mjs`:

```js
import Slugger from "github-slugger";
import fs from "node:fs";
import path from "node:path";
import { globSync } from "node:fs";

const root = process.cwd();
const patterns = ["README.md", "CLAUDE.md", "docs/**/*.md", "tests/**/*.md", "packages/*/README.md"];
const sources = [...new Set(patterns.flatMap((p) => globSync(p, { cwd: root, exclude: (f) => f.includes("node_modules") })))].sort();

const slugCache = new Map();
function slugsOf(file) {
	if (slugCache.has(file)) {
		return slugCache.get(file);
	}
	const slugger = new Slugger();
	const set = new Set();
	let fence = false;
	for (const line of fs.readFileSync(file, "utf8").split("\n")) {
		if (/^\s*(```|~~~)/.test(line)) {
			fence = !fence;
			continue;
		}
		if (fence) {
			continue;
		}
		const m = line.match(/^#{1,6} (.+)$/);
		if (m) {
			set.add(slugger.slug(m[1].replace(/\s+#*$/, "")));
		}
	}
	slugCache.set(file, set);
	return set;
}

const errors = [];
let checked = 0;
for (const rel of sources) {
	const abs = path.join(root, rel);
	let fence = false;
	fs.readFileSync(abs, "utf8").split("\n").forEach((line, i) => {
		if (/^\s*(```|~~~)/.test(line)) {
			fence = !fence;
			return;
		}
		if (fence) {
			return;
		}
		for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
			const target = m[1];
			if (/^[a-z][a-z0-9+.-]*:/.test(target) || target.startsWith("//")) {
				continue;
			}
			const [p, frag] = target.split("#");
			const resolved = p === "" ? abs : path.resolve(path.dirname(abs), decodeURIComponent(p));
			checked++;
			if (!fs.existsSync(resolved)) {
				errors.push(`${rel}:${i + 1} missing file -> ${target}`);
				continue;
			}
			if (frag && resolved.endsWith(".md") && !slugsOf(resolved).has(frag)) {
				errors.push(`${rel}:${i + 1} missing anchor -> ${target}`);
			}
		}
	});
}
if (errors.length > 0) {
	console.error(errors.join("\n"));
	process.exit(1);
}
console.log(`check-doc-links: ${checked} links OK across ${sources.length} files`);
```

Note: `globSync` from `node:fs` is available on Node ≥22 (repo standard is Node 26). If the `exclude` option is rejected on the installed Node, filter `node_modules` with a `.filter()` after globbing instead. Match brace style to Biome's `useBlockStatements` (as written above).
- [ ] **Step 3: Run it — expect it to FAIL or PASS honestly.** `node scripts/check-doc-links.mjs`. Pre-existing broken links in historical docs (`docs/superpowers/plans/**`) are likely. If any appear: narrow scope by replacing the `docs/**/*.md` pattern with `docs/*.md`, `docs/architecture/**/*.md`, `docs/adr/*.md`, `docs/research/*.md`, `docs/superpowers/specs/*.md` (excluding `plans/` — point-in-time artifacts referencing pre-split paths). Re-run until exit 0 with a truthful scope; record the final scope in the script's header comment.
- [ ] **Step 4: Prove it detects breakage.** Temporarily add `[x](no-such-file.md)` to `docs/dependency-cruiser.md`, run, expect exit 1 naming that file:line; revert the temp line, re-run, expect exit 0.
- [ ] **Step 5: Wire root script + CI.** In root `package.json` scripts: `"check:doc-links": "node scripts/check-doc-links.mjs"`. In `.github/workflows/ci.yml` `checks` job, after the "Workflow lint (actionlint)" step:

```yaml
      - name: Docs link check (files + anchors)
        run: pnpm check:doc-links
```

- [ ] **Step 6: Gauntlet the touched surface.** `pnpm exec biome ci scripts/check-doc-links.mjs package.json`, `pnpm lint:actions`, `pnpm check:scripts` (root scripts changed — confirm the PR #146 meta-gate still passes), `pnpm lint:eslint` (new root `.mjs` — if ESLint errors about an unlisted file, mirror how `scripts/check-workspace-scripts.mjs` is included in the ESLint/tsconfig config and copy that wiring). All green.
- [ ] **Step 7: Commit** — `feat(docs): add repo-wide markdown link/anchor checker (script + CI gate)`.

---

### Task 2: §13 Codebase Map

**Files:**
- Create: `docs/architecture/13-codebase-map.md`
- Modify: `docs/architecture/12-architectural-gates.md` (nav line: add `[13. Codebase Map ▶](13-codebase-map.md)` as the "next" link)

**Interfaces:**
- Consumes: Anchor Contract; package READMEs by path (`../../packages/<name>/README.md`) — they may not exist yet in your checkout; link anyway, Task 17 verifies.
- Produces: the §13 anchors in the contract; the L1 card layout other docs reference.

- [ ] **Step 1: Research.** Read `CLAUDE.md` (package table), `docs/architecture/01-overview.md` §1.3–1.3.1, `docs/architecture/06-package-dependencies.md`, `pnpm-workspace.yaml`, every `packages/*/package.json` (verify each package's real `dependencies`), `ls packages/*/src`, `ls tests`.
- [ ] **Step 2: Write the file** with the frozen headings (13.1–13.4), a nav first line matching the other sections (`[◀ 12. Architectural Gates](12-architectural-gates.md) · [Architecture Document](../architecture.md)`), and:
  - **13.1 L0**: one Mermaid flowchart, whole system on a screen — 2 shipping apps, planned Solid client (dashed), server, shared column (client-core / react-bindings / domain / shared / ws-effects), both runtime modes. ≤5 siblings per rank: use subgraphs per building ("Web app", "Mobile app", "Server", "Shared floors").
  - **13.2 L1**: per package one **card** (a small table or definition list): what it is / ring / depends-on (verified from its package.json) / consumed-by / one non-obvious fact / link to `../../packages/<name>/README.md`. Also cover the `tests/` workspace as a 10th card (not a package — the behavioural insurance layer, link `../../tests/README.md`).
  - **13.3 L2**: compressed shape of each package's `src/` — a single tree fence per package, 3–8 lines each, folder names + one-word roles; explicit sentence that the authoritative module detail lives in the package READMEs.
  - **13.4 Reuse matrix**: rows = ports / use cases / presenters / machines / simulators / WsAdapter+port factories / theme / wire protocol / ws-effects framework / ViewModel bindings; columns = client-react, client-react-native, client-solid (planned), server. Cells: ✅ verbatim / 🔧 adapted / — not used, with footnotes explaining every 🔧. Verify each cell by grepping imports (e.g. `grep -rn "@rtc/client-core" packages/client-react-native/`), cite findings in the task report. Close with "what each app adds on top" bullet lists (web: browser adapters, CSS Modules HUD, Vite; RN: native adapters, RN SVG skins, Expo; server: effects + services).
- [ ] **Step 3: Validate** every Mermaid block via the Mermaid MCP tool; fix until all pass.
- [ ] **Step 4: Link-check** — `pnpm check:doc-links` if Task 1 is merged into the branch; otherwise verify each link target manually with `ls`/anchor-contract.
- [ ] **Step 5: Commit** — `docs(atlas): add §13 Codebase Map (L0/L1/L2 + reuse matrix)`.

---

### Task 3: §14 Composition & Wiring

**Files:**
- Create: `docs/architecture/14-composition-and-wiring.md`

**Interfaces:**
- Consumes: Anchor Contract; §13/§15 by anchor; package READMEs by path.
- Produces: §14 anchors (14.1–14.3); the per-app adapter tables that §16 recipes cite.

- [ ] **Step 1: Research (all claims verified from source).** Read in full: `packages/client-core/src/composition.ts`, `packages/client-core/src/adapters/` (esp. `portFactory.ts`), `packages/client-core/src/wsUrl.ts`, `packages/client-react/src/main.tsx` + `src/AppRoot.tsx` + `src/app/` (find where ports are chosen: simulator vs WS), `packages/client-react/src/bootSplashGate.ts`, `packages/client-react-native/src/app/` (entry + composition), `packages/server/src/index.ts` + `src/socket/`, `packages/react-bindings/src/ViewModelProvider.tsx`. Also `docs/architecture/07-communication-patterns.md` "Runtime Topology" (link, don't duplicate).
- [ ] **Step 2: Write the file** (nav line; frozen headings):
  - **14.1**: `createApp()` walkthrough — construction order as a numbered list naming real symbols; one Mermaid diagram of the object graph (ports → use cases → presenters/machines → ViewModel bundle). State explicitly what is constructed once vs per-mount.
  - **14.2**: one table per app (web / RN / server). Columns: Port family | Simulator-mode impl | WS-mode impl | Shared with other apps? Rows from the real port families in `portFactory.ts` and the simulators. Below each table: where mode selection happens for that app (file:symbol — e.g. the wsUrl/env logic), and which adapters are platform-specific (persistence/theming/transport) vs verbatim-shared.
  - **14.3**: per app a boot sequence — Mermaid sequenceDiagram from entry file to first rendered tick (web: `index.html` → `main.tsx` → BootGate/LockScreen → provider → first tile; RN: Expo entry → same core path; server: `index.ts` → listener → effects registration). Numbered prose steps under each diagram naming files. An animated SVG here is welcome if it clarifies more than the sequence diagrams (author's choice).
- [ ] **Step 3: Validate** all Mermaid blocks (MCP).
- [ ] **Step 4: Link-check** (as Task 2 Step 4).
- [ ] **Step 5: Commit** — `docs(atlas): add §14 Composition & Wiring (roots, adapter tables, boot)`.

---

### Task 4: §15 Flows

**Files:**
- Create: `docs/architecture/15-flows.md`

**Interfaces:**
- Consumes: Anchor Contract; existing §4/§5/§7 anchors (verify with grep before use); §14 anchors.
- Produces: §15 anchors; flow names cited by §16 and READMEs ("see §15 Flows").

- [ ] **Step 1: Research.** Read `docs/architecture/04-sequence-diagrams.md`, `05-state-diagrams.md`, `07-communication-patterns.md` (to LINK to, never duplicate); then the real code for each flow: connection (`packages/client-core/src/presenters/` connection presenter + `packages/domain/src/connection/`), FX execution (execution machine/presenter, `packages/domain/src/usecases/` execution use case, server execution effect in `packages/server/src/effects/`), credit RFQ (domain `credit/`, RfqsPresenter, server credit effects), equities order (domain `equities/`, order port, server effects), admin telemetry (domain `telemetry/`, simulator-only — confirm no wire protocol by grepping `packages/shared/src/protocol/`).
- [ ] **Step 2: Write the file** (nav line; `## 15. Flows`; `### 15.1 Control Flow vs Imports vs Data Flow` first — the three-directions explainer, ~3 paragraphs + one small diagram; then one `###` per flow, headings free-form). Each flow: one Mermaid diagram laid out as layers/swimlanes (UI → bindings → presenter/machine → use case → port → adapter/simulator → [wire → server effect]) + numbered prose steps naming real files/symbols + a closing line linking the §4/§5 diagram that shows the same thing at message level. The price tick: a short pointer paragraph to §7's animated treatment — no re-telling. Animated SVGs welcome for 1–2 flows where motion genuinely helps (e.g. RFQ state progression).
- [ ] **Step 3: Validate** Mermaid (MCP); if you added animated SVGs, open each in a browser once (or render a frame headlessly) to confirm they load and loop.
- [ ] **Step 4: Link-check** (as Task 2 Step 4).
- [ ] **Step 5: Commit** — `docs(atlas): add §15 Flows (control vs data flow walkthroughs)`.

---

### Task 5: §16 Trailheads

**Files:**
- Create: `docs/architecture/16-trailheads.md`

**Interfaces:**
- Consumes: §13/§14/§15 anchors; `docs/architecture/12-architectural-gates.md` gate numbers; the inventory-folder rule (Global Constraints).
- Produces: `#16-trailheads` + one `###` per recipe (free-form headings); READMEs link to the file top only.

- [ ] **Step 1: Research each route by walking the real code path.** For every recipe list the actual files a change touches, in dependency order — verify by finding the current instances (e.g. for "add a currency pair": grep where existing pairs are defined in `packages/domain/src/fx/` and simulators; for "add a wire message": pick one existing message and list every file its name appears in via `grep -rn "<MSG_NAME>" packages/`). For recipe 5 read `scripts/check-workspace-scripts.mjs`, `knip.json` (or knip config location), `eslint.config.mjs` + `tsconfig.eslint.json` to state exactly which configs a new package must join.
- [ ] **Step 2: Write the five recipes** (per spec §3.5): add a currency pair; add a port + adapter + simulator; add a wire message (shared protocol + server effect + client adapter); add a UI panel (web and/or RN); add a package. Each recipe = **Route** (ordered file list with one-line "what you do here") + **Change-impact checklist** (which unit tests, which grep gates by number, whether visual goldens regenerate — both sets per the goldens policy — whether UI contract coverage applies, which inventory tables in §13/READMEs to update). Keep each recipe ≤ a screen.
- [ ] **Step 3: Sanity-proof one recipe.** Pick recipe 1 and dry-run it read-only: confirm every file on the route exists and the ordering makes sense; note the dry-run in the task report.
- [ ] **Step 4: Link-check** (as Task 2 Step 4). **Step 5: Commit** — `docs(atlas): add §16 Trailheads (task recipes + impact checklists)`.

---

### Task 6: §10 expansion (in place)

**Files:**
- Modify: `docs/architecture/10-key-design-decisions.md` (keep the existing table at top as the summary; append narratives below it)

**Interfaces:**
- Consumes: `docs/adr/ADR-001…004` (ADR-001 lives at `packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md` — verify), existing §1/§3/§7/§8/§9 anchors.
- Produces: one `###` heading per decision (free-form text; other tasks link only to `#10-key-design-decisions`).

- [ ] **Step 1: Research.** Read the current §10 table, all four ADRs, `docs/architecture/01-overview.md` §1.2/§1.4, `08-replaceability-matrix.md`, `09-test-strategy.md`. For each decision find the code artifact that embodies it (e.g. simulators-as-production: `packages/domain/src/simulators/` + composition selection) and verify it.
- [ ] **Step 2: Write ten narratives** (spec §3.6 list: RxJS boundary type; ports in domain; ViewModel seam; dumb UI; simulators as production code; ws-effects server; monorepo layout; CSS Modules; visual goldens as swap contract; tests workspace/ten-suite rationale). Per decision, the four-beat structure: **Problem → Choice → Alternatives rejected (and why) → Cost accepted**, ending with an ADR link where one exists. 100–250 words each; no new diagrams required (link existing ones instead).
- [ ] **Step 3: Link-check** (as Task 2 Step 4). **Step 4: Commit** — `docs(atlas): expand §10 into decision narratives (problem/choice/alternatives/cost)`.

---

### Task 7: Hub reading guide + TOC

**Files:**
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: Anchor Contract (§13–§16 file names + subsection anchors for TOC sub-entries).
- Produces: the hub structure everything else points "up" to.

- [ ] **Step 1: Add the "How to read this" block** between the intro sentence and `## Table of Contents` — heading `## How to read this`, three short paragraphs: **New here?** (§1 → §13 → your app's package README), **Changing something?** (§16), **Deep reference** (§2–§9), each with links.
- [ ] **Step 2: Extend the TOC** — entries 13–16 in the established style, with sub-bullets for 13.1–13.4, 14.1–14.3, 15.1 (targets exactly per the Anchor Contract).
- [ ] **Step 3: Link-check** (must pass if §13–§16 exist on the branch by now; if running in parallel, note it and let Task 17 verify). **Step 4: Commit** — `docs(atlas): hub reading guide + TOC for §13–§16`.

---

### Tasks 8–16: Package READMEs (one task per package, template in Global Constraints)

Common steps for every README task:

- [ ] **Step 1: Research** — `cat packages/<name>/package.json` (real deps), `ls -R packages/<name>/src` (map to module level), read the package's `index.ts` exports and its 2–4 shape-revealing files, grep one real consumer usage (`grep -rn "@rtc/<name>" packages/ tests/ | grep -v <name>/`), read `docs/architecture/12-architectural-gates.md` and note gates that name this package.
- [ ] **Step 2: Write/extend `packages/<name>/README.md`** per the template. For the 3 packages with existing READMEs: `Read` the current file first; ADD the identity card at top and the missing template sections; keep every existing line (operational content stays under its current headings).
- [ ] **Step 3: Verify** — every file named exists; the usage snippet is copied (not paraphrased) from the cited consumer file; links target the Anchor Contract or existing anchors.
- [ ] **Step 4: Commit** — `docs(atlas): README for @rtc/<name>`.

Per-package facts the writer must verify and include:

| Task | Package | Key entry points (verify) | Notes |
|---|---|---|---|
| 8 | `domain` | `src/index.ts`, `src/ports/`, `src/usecases/` | rxjs-only policy; inventory tables for `ports/` and `simulators/`; domain slices (fx/credit/equities/analytics/connection/telemetry/preferences) described as roles |
| 9 | `shared` | `src/index.ts`, `src/protocol/` | wire protocol home (CLIENT_MSG/SERVER_MSG, envelopes); depends only on domain |
| 10 | `client-core` | `src/composition.ts`, `src/adapters/portFactory.ts`, `src/index.ts` | framework-free app core; no React/DOM/RN imports (name the enforcing gates); link §14.1 |
| 11 | `react-bindings` | `src/createViewModel.ts`, `src/useMachine.ts`, `src/useViewModel.ts` | the React↔RxJS bridge; StrictMode deferred-dispose note (verify in `useMachine.ts`) |
| 12 | `client-react` | `src/main.tsx`, `src/AppRoot.tsx`, `src/app/`, `src/ui/` | EXISTING README — extend; dumb-UI gates 26–29; CSS Modules policy |
| 13 | `client-react-native` | `src/app/`, `src/ui/` | EXISTING README — extend; Expo SDK 57/RN 0.86; native dev-client note stays |
| 14 | `client-prototype` | `src/main.tsx`, `src/App.tsx` | EXISTING README — extend; isolated (no `@rtc/*` imports); design-comprehension artifact, port 5273 |
| 15 | `ws-effects` | `src/index.ts`, `src/types.ts`, `src/createWsListener.ts` | rxjs-only; the declarative effects framework; consumed by server only |
| 16 | `server` | `src/index.ts`, `src/socket/`, `src/effects/` | inventory table for `effects/`; `src/socket` naming (never name a dir after a runtime dep — the ws collision story, verify in git history/memory before asserting details) |

---

### Task 17: Integration pass + gauntlet + PR

**Files:**
- Modify: any file failing a check (fix-forward)

**Interfaces:** consumes everything; produces the green branch.

- [ ] **Step 1: Full link check** — `pnpm check:doc-links` → exit 0. Fix any cross-task link drift (this is where parallel-written links to then-unwritten files get proven).
- [ ] **Step 2: Mermaid sweep** — validate any block not yet validated (grep for ` ```mermaid ` across new/modified files; each task should have done its own — trust but verify a sample of 5).
- [ ] **Step 3: Spot-audit (spec acceptance #7)** — sample 10 file/symbol claims across §13–§16 and 3 READMEs; `ls`/`grep` each; all must exist.
- [ ] **Step 4: No-content-loss check for the 3 extended READMEs** — `git diff main -- packages/client-react/README.md packages/client-react-native/README.md packages/client-prototype/README.md` must show only additions/moves, zero deleted information (deleted lines allowed only if verbatim re-added elsewhere in the file).
- [ ] **Step 5: Gauntlet** — `pnpm exec biome ci .` (repo-wide, catches script formatting), `pnpm lint:eslint`, `pnpm lint:eslint:types`, `pnpm lint:actions`, `pnpm check:scripts`, `pnpm lint:dead` (knip — the new script must not flag; if it does, add it to knip's entry config the same way `check-workspace-scripts.mjs` is handled), `pnpm typecheck`, `pnpm test` (unchanged packages should be cache hits). All green.
- [ ] **Step 6: Push + PR.** Follow the shipping-repo-changes skill: push, `gh pr create` (title `docs: the Codebase Atlas — §13–§16, decision narratives, package READMEs, link-check gate`; body summarizes deliverables + how each acceptance criterion was verified), CI loop via `gh run list` matching HEAD SHA, catch up to `origin/main` if it moved, re-green. **Do NOT merge — the user reviews first.**

---

## Self-review notes (completed)

- Spec coverage: §3.1→Task 7, §3.2→Task 2, §3.3→Task 3, §3.4→Task 4, §3.5→Task 5, §3.6→Task 6, §3.7→Tasks 8–16, §3.8→Task 1; conventions (§4) in Global Constraints; execution shape (§5)→Task 17 + this plan's parallelization; acceptance criteria mapped in Tasks 1–17 (criterion 1→Tasks 2–5+7, 2→6, 3→8–16+17.4, 4→2, 5→1+17.1, 6→per-task validation+17.2, 7→17.3).
- No placeholders: every content task carries its skeleton, research list, and verification; the one code file is fully written.
- Consistency: anchor contract is the single source for cross-task links; README links use file paths only.
