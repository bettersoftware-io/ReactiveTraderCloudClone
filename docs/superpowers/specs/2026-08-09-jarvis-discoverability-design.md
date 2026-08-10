# Jarvis Discoverability Round — Hints, Demo Guide, Run Full Demo (Design)

**Date:** 2026-08-09
**Workstream:** Jarvis AI — discoverability. Graduates the "Discoverability
round" entry from `docs/IDEAS.md` (captured 2026-08-09). Not a capability
round: nothing new becomes *possible*; everything shipped becomes
*findable*. Folds in the persona panel-id roster fix from the P5
drive-targeting findings ledgered in `docs/STATUS.md` the same day.

## 1. Problem

The overlay's suggestion chips are the four P1 strings ("Where is EURUSD?",
"What's moving?", "How am I doing?", "Buy 5M EURUSD") while the surface has
since grown generative panels, panel restyling, app-driving, workspace
setup, theme/power-saver control and the narrator — the scripted engine
alone matches 12 intents. Users cannot discover what shipped. The v5 design
prototype solves this with a ⓘ **demo guide** panel (sectioned, clickable
command list) and a hands-free **▶ RUN FULL DEMO** autoplay; neither was
ever ported.

## 2. Decisions (settled during brainstorm, 2026-08-09)

- **Demo brain: always scripted.** Every demo turn rides
  `ask(text, { brain: "scripted" })` — the per-turn override shipped in
  governance round 1, so no new plumbing. Deterministic pacing, zero
  tokens on any server (including deployed), immune to the budget gate,
  CI-testable. The user's brain preference is untouched.
- **Demo trade: show the confirm card, then auto-decline.** The demo
  pauses on the card long enough to read, then declines ("Understood, sir
  — standing down. Nothing was executed."). Showcases execution AND the
  human-in-the-loop story; never mutates the blotter (the deployed server
  is shared).
- **Hint chips: rotate from the shared catalog.** The four static strings
  are replaced by a deterministic per-open sample of the guide catalog —
  chips and guide can never drift apart.
- **Content honesty: shipped features only.** Every guide line and demo
  step is a command that works today. The scripted `HELP_REPLY`'s existing
  one-line teaser ("Sentinels, widgets and drills arrive in a later
  build") stays the only forward reference; no greyed "coming soon" rows.

## 3. The catalog — one source of truth (`@rtc/client-core`)

New framework-free module
`packages/client-core/src/presenters/jarvisGuideCatalog.ts` (beside the
Jarvis machines — client-core has no `src/jarvis/` directory; the
presenters directory is where every Jarvis machine already lives):

```ts
export interface JarvisGuideItem {
  /** The literal command sent as a user turn when clicked. */
  readonly command: string;
  /** True when only a live (LLM) brain can act on it — rendered as a
   * subtle "live brain" annotation; clicking on scripted still sends and
   * receives the honest mandate-fallback reply. */
  readonly liveOnly?: boolean;
}

export interface JarvisGuideSection {
  readonly title: string;
  readonly items: readonly JarvisGuideItem[];
}

export const JARVIS_GUIDE_CATALOG: readonly JarvisGuideSection[];
```

Sections and items (final copy authored at plan time, but the shape is):

- **DESK INTELLIGENCE** — "What's moving?", "Where is EURUSD?",
  "How am I doing?", spread query.
- **GENERATIVE UI** — show-panel and restyle-panel phrasings that
  `matchJarvisIntent` provably matches.
- **DESK CONTROL** — "Set up my morning workspace" (scripted-capable);
  theme switch / power-saver / equities-chart commands marked `liveOnly`.
- **EXECUTION** — "Buy 5M EURUSD" (confirm-gated).

**Conformance gate:** a test walks every non-`liveOnly` catalog command
through `matchJarvisIntent` and asserts it does NOT resolve to
`fallback` — a catalog line the scripted brain cannot parse fails CI.
(The `liveOnly` rows are covered by the persona instead — see §7.)

## 4. The ⓘ demo guide panel (both web clients)

Prototype-faithful placement: a ⓘ toggle button beside the overlay's ✕
(top-right) **and** a `ⓘ DEMO GUIDE` entry in the existing footer row
(`ESC · CLOSE | CTRL+J · TOGGLE | CORE … ▸ SWITCH`), which also gains
`▶ RUN FULL DEMO`. The panel: right-side, fixed width (~314px per the
prototype), scrollable, containing in order:

1. the **▶ RUN FULL DEMO · HANDS-FREE** button (same action as the footer
   entry);
2. the explainer line: *"Every line below is a live command — click one to
   send it to J.A.R.V.I.S."*;
3. the catalog sections, each item a clickable row — click sends the
   command as a **normal user turn on the current brain** (not the demo's
   scripted pin), exactly as if typed;
4. a tips block (real tips only): ⌘/Ctrl+J summon + ESC dismiss, the demo
   stop control, panels outliving the conversation.

React and Solid implementations with byte-identical `*.module.css`, the
established port discipline. Guide open/closed is view state in the
overlay component (not a machine — it is presentation-local, per ADR-005).

## 5. Rotating hint chips

`SUGGESTIONS` (both clients) is deleted. The chip row renders
`sampleGuideChips(catalog, seed)` — a pure client-core function returning
four commands drawn from four **different** sections, rotating
deterministically with `seed` (the overlay's open-counter, already
observable to the machine; injected in tests so specs pin exact sets for
seeds 0/1/2). Every overlay open surfaces a different feature mix. The
contract/e2e specs that pinned the four literals are rewritten against the
sampler's seeded output — the pinned-strings caveat from IDEAS, paid here.

## 6. `JarvisDemoMachine` (`packages/client-core/src/presenters/JarvisDemoMachine.ts`, ADR-005 machine)

An autonomous async fold, timed by an injected scheduler (rxjs default in
production, `TestScheduler` in tests):

- **Script:** derived from the catalog's scripted-safe subset at module
  scope (not hand-duplicated strings): open overlay → greeting beat →
  quote → movers → P&L → show panel → restyle panel → morning workspace
  (the overlay **closes** so the app visibly drives itself, then reopens)
  → "Buy 5M EURUSD" → confirm-card beat → **decline** → closing line.
- **Per step:** send via `ask(text, { brain: "scripted" })`, await that
  turn's terminal event (`done`/`error`), then a paced inter-step beat.
  Under power-saver `freeze` the beat is 0 (the P5 drive-stagger rule).
- **Progress state:** `{ running, i, n, label }` exposed on the machine;
  the footer renders `STEP i/n · LABEL` and `■ STOP` while running.
- **Halt:** `stop()`, ESC, or any manual user send aborts immediately
  (in-flight scripted turn completes; queue is dropped). A halted or
  completed demo restores nothing — it never changed the brain pref.
- **Error posture:** a turn `error` aborts the demo with the machine
  returning to idle; no retry loop.

## 7. Server fold-in — the persona panel-id roster (drive-targeting fix)

From the P5 drive-targeting findings (STATUS, 2026-08-09): the persona
never enumerates per-tab layout panel ids, its only worked drive example
is equities, and a wrong `panelId` guess dies client-side with no signal
back to the model. This round ships the two prompt-side fixes:

- the persona gains a per-tab panel-id roster **derived from the same
  constants `defaultLayoutPort` uses** (never-drift, like the drive
  schema's enums) — e.g. `fx: fx-rates ("Live Rates"), fx-analytics …`;
- plus one FX worked example: *"maximise Live Rates"* →
  `{kind:"layout", op:"maximize", tab:"fx", panelId:"fx-rates"}`.

The persona's 3000-char guard is near binding (~3% headroom, per the P5
ledger): if the roster does not fit, the guard is raised **deliberately**
in the same commit with the ledger note updated — not trimmed into
uselessness. The correction-signal gap (skipped outcomes never reach the
model) stays ledgered — it is a wire/architecture change, out of scope.

## 8. Testing (no Anthropic API calls in CI, as ever)

- **Catalog conformance:** every non-`liveOnly` command resolves to a
  non-`fallback` intent (§3).
- **Machine (`TestScheduler`):** step pacing, freeze = zero beat,
  progress folds, decline choreography on the confirm step, halt on
  `stop()`/manual send, error-abort.
- **Contract (`@rtc/ui-contract`, swap-trio, both clients):** guide panel
  renders the catalog sections; row-click sends the row's command; chips
  render the seeded sample (seeds pinned); footer demo affordances;
  progress + stop rendering while a demo runs.
- **Visual:** one new scenario — overlay with the guide panel open — added
  to the shared matrix; both golden sets regenerated (react writes, solid
  asserts).
- **E2e (Gherkin, both clients):** open guide → click a command → reply
  streams; start full demo → first steps complete with progress visible →
  stop halts it. The full ~13-step run is exercised at machine level, not
  e2e (wall-clock discipline).
- **Persona:** unit pins the roster derivation against `defaultLayoutPort`
  (a renamed panel id fails the test) and the char-guard.

## 9. Out of scope (recorded)

- RN surfaces (guide/demo/chips on mobile) — joins the RN Jarvis backlog.
- Voice / `speechSynthesis` narration of the demo — Jarvis voice is out of
  scope indefinitely (STATUS).
- Roadmap-teaser rows in the guide (content-honesty decision, §2).
- Guide search/filtering; per-user or per-context catalog curation.
- The drive correction-signal wire change (skipped outcomes → model).

## 10. Plan-time deviations + final-review record (2026-08-09)

Eight deviations were ruled at plan time from a fact-sheet audit (full list in
the plan's header): the chip seed required a new `openCount` field (no counter
existed); the panel roster was promoted to `@rtc/shared` with a client-core
conformance gate (the only dependency-legal never-drift shape — §7's "unit
test in server against defaultLayoutPort" was impossible); the demo rides a
new `sendScripted` machine intent (`ask` options were unreachable from the
UI layer and require `effort` too); e2e follows the existing plain-Playwright
jarvis pattern (no Gherkin jarvis suite exists); footer copy matches the real
footer (`⌘J`, twin skin marks); the synthetic closing line was dropped (the
workspace reply closes, matching the prototype); `setupWorkspace` runs LAST
(its scripted reply re-emits the panel at `viz:"line"`, which mid-script
would undo the restyle step); the chip sampler draws only non-`liveOnly`
items. One further softening recorded at final review: §6's separate P&L
beat was absorbed into the "Brief me on the desk" step. A 30s per-step
watchdog (`DEMO_STEP_TIMEOUT_MS`) was added in review — `sendScripted` is a
silent no-op while Jarvis is unavailable, and without it the demo would pin
at running forever. Final whole-branch review 2026-08-09: SHIP, zero
blocking findings.
