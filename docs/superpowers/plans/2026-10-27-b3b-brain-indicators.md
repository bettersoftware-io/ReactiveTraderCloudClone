# B3b — Brain Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone talking to Jarvis in either web client can always see which brain is answering, on whose key, and how much of today's budget is left. There are three indicators, each switchable in Preferences.

**Architecture:** The server stamps every turn with the brain that actually ran, as a new `brain` turn event. The client adapter stops dropping B3a's `budget` from `JARVIS_AVAILABILITY`. The shared Jarvis controller in `@rtc/core-logic` carries both into `JarvisState`, so all three application cores get the change with no per-core code. Pure formatters in `@rtc/core-logic` turn that state into the readout, tag and pill copy, and both web clients render them from one CSS file kept byte-identical. The three switches are one record-valued preference in the existing Jarvis preference group.

**Tech Stack:** TypeScript, RxJS / async / Effect cores, React 19 + Solid, Vitest, Playwright visual tier.

**Spec:** [docs/superpowers/specs/2026-10-25-b3-ai-metering-byo-keys-design.md](../specs/2026-10-25-b3-ai-metering-byo-keys-design.md), §4 (with §3.1, §3.8 and D5, D8, D17)

**Rulings made during execution:** [2026-10-27-b3b-brain-indicators-rulings.md](2026-10-27-b3b-brain-indicators-rulings.md)

## Global Constraints

- Both web clients render every indicator identically. `.module.css` files are byte-identical between `client-react` and `client-solid` (`client-solid/tests/parity/cssParity.test.ts`). The React Native client is out of scope, but it implements the preferences port and must compile.
- The meter is a static bar. Its width changes only between turns, with no animation or transition (spec §4.1, `docs/performance.md`).
- The reply tag names the brain the **server** ran (spec §4.2). Until a `brain` event arrives, an entry carries the brain the client asked for.
- Copy is written in sentence case and shown in capitals with CSS `text-transform: uppercase`, the way the HUD already does. Tests assert the sentence-case text.
- Defaults (spec §4.4): readout **on**, reply tags **on**, brain pill **off**.
- Before changing any member of `core-api`, `core-logic`, `core-contract` or a core, load `.claude/skills/application-core-rules/SKILL.md`. Before writing CSS, read `docs/performance.md`. Before naming a handler, read `docs/handler-naming.md`.
- Every new test is proven with `node scripts/mutation-check.mts <spec.json>`.
- A test waiting on time uses fake timers.
- Rollout correction to spec §10: B3b deploys **the server and both web clients**, because the `jarvis.brain` frame comes from the server. Clients ignore unknown frame types (`WsAdapter` routes by type), so a tab still on an old bundle is unaffected. A new client talking to an old server falls back to the brain it asked for.

## Rulings made while planning (open to correction)

- **R1 — one preference, not three.** The spec allows its names to change (§4.4). The three switches become a single `jarvisIndicators: JarvisIndicators` value, `{ readout, replyTags, brainPill }`, stored as one JSON string. It is read field by field against the defaults, so a partial or garbled stored value keeps every valid field. This takes one trip through the ~18 preference sites instead of three.
- **R2 — demo is a flag on availability.** `JarvisAvailability.demo: boolean` is `true` only in `JARVIS_SIM_AVAILABILITY`, the in-browser scripted brain. That covers the demo login and every `dev:*` simulator mode. A live server never sets it.
- **R3 — administrator and roster readout.** These callers have `limitUsd === null` (D17). The readout reads `Claude Opus 5 · house key · no personal limit`, with no meter.
- **R4 — exhausted reasons.** `user` and `forced` read `Today's AI budget used · back at 00:00 UTC`. `house` reads `House AI budget used · back at 00:00 UTC`. `unavailable` reads `AI budget unavailable`, with no reset time, because none is known.
- **R5 — the switch line.** B3a left the client system line reading "Usage budget reached — continuing on …". Spec §3.8 calls for it to become the D5 switch line, so it now uses the same reason-aware copy as the readout, for example `Today's AI budget is used — switching to the scripted brain until 00:00 UTC.`
- **R6 — no live budget.** When `budget` is `null` (a pre-B3a server, or no signed-in caller), a live brain reads `Claude Haiku 4.5 · house key`, with no amount and no meter.
- **R7 — own key waits for B3c.** The spec's own-key readout lines (`· your key · $0.62 of $1.00 today` / `· no daily limit`), the `GPT-…` tags and the pill's "Your key" group need own keys, and `JarvisBudgetView.keyKind` is only `"house"` until B3c. Here `describeBrainReadout` switches on `keyKind`, so B3c adds a case rather than restructuring.

## Review Focus

1. **A new client on an old server sends no `brain` event.** Each reply must still be tagged, with the brain the client asked for, and never left blank. Pinned in Task 2.
2. **Overshoot.** `spentUsd > limitUsd` (spec §3.4 allows one request of overshoot) must read `$0.00 of $0.20 left today`, with the meter empty. Never a negative amount or width. Pinned in Task 4.
3. **Escape in the brain pill's menu** closes the menu only. It must not also close the overlay, which Escape closes today. Pinned in Task 6.
4. **A gated brain in the pill menu** is disabled, exactly as the Preferences picker disables it. Picking an enabled brain writes the same `jarvisBrain` preference. Pinned in Task 6.
5. **A stored indicators value that is malformed, partial or from a future version** still loads: valid fields are kept and the rest default. Pinned in Task 3.

---

### Task 1: The server stamps each turn with the brain that ran

**Files:**
- Modify: `packages/domain/src/jarvis/jarvisEvent.ts`: new `JarvisEvent` variant.
- Modify: `packages/domain/src/preferences/preferences.ts`: `JARVIS_BRAIN_NAMES`, exported from `packages/domain/src/index.ts`.
- Modify: `packages/shared/src/protocol/messages.ts`: `SERVER_MSG.JARVIS_BRAIN = "jarvis.brain"`.
- Modify: `packages/shared/src/jarvis/jarvisPayloads.ts`: header comment (the wire rule gains the variant).
- Modify: `packages/server/src/effects/jarvis.effects.ts`: `WIRE_TYPE_BY_EVENT`, `routeTurn`, `runTurnFor` and `projectChatTurn`.
- Test: `packages/server/src/effects/jarvis.effects.test.ts`, or the file that tests `routeTurn` today.

**Interfaces:**
- Produces: the `JarvisEvent` variant `{ readonly type: "brain"; readonly brain: JarvisBrain }`; on the wire, `jarvis.brain` with payload `{ brain, turnId }`.
- Produces: `JARVIS_BRAIN_NAMES: Readonly<Record<JarvisBrain, string>>`, which is `{ scripted: "Scripted", "claude-haiku-4-5": "Claude Haiku 4.5", "claude-sonnet-5": "Claude Sonnet 5", "claude-opus-5": "Claude Opus 5" }`. `JARVIS_BRAIN_LABELS` stays as it is: the short form, used by the chip and the pill.

- [ ] **Step 1: Write the failing tests.** Each test drives a `jarvis.chat` frame through the effect and asserts that the **first** frame of the turn is `jarvis.brain`, before any `jarvis.delta`, with the brain below:
  - A member asking for `claude-sonnet-5` within budget: `{ brain: "claude-sonnet-5" }`.
  - A member asking for Opus, which is not offered: the resolved default `claude-haiku-4-5`.
  - A member whose budget is exhausted (in-memory store): `scripted`.
  - A narrator-origin turn: `scripted`.
  - A turn where no live Anthropic session exists, so the server falls back to scripted (`runTurnFor`'s fallback branch): `scripted`, even though the brain asked for was a model.
  - Exactly one `jarvis.brain` frame per turn.
- [ ] **Step 2: Run them and see them fail.** Command: `pnpm --filter @rtc/server test -- jarvis.effects`.
- [ ] **Step 3: Implement.** Thread the brain that actually runs out of `runTurnFor`; its fallback branch knows it is `scripted`. Prepend `{ type: "brain", brain }` to the turn's event stream. Add `brain: SERVER_MSG.JARVIS_BRAIN` to `WIRE_TYPE_BY_EVENT`. Then update every exhaustive `switch` over `JarvisEvent["type"]` that the compiler flags. Outside the server that is `ScriptedJarvisEngine`, which never emits it, and the client controller, which Task 2 handles, so give each a no-op case until then.
- [ ] **Step 4: Run them and see them pass.** Then mutation-check: drop the prepend; stamp the requested brain instead of the resolved one.
- [ ] **Step 5: Commit.** `feat(server): stamp each Jarvis turn with the brain that ran`.

### Task 2: Budget, demo and per-reply brain reach `JarvisState`

**Files:**
- Modify: `packages/core-api/src/adapters.ts`: `JarvisAvailability` gains `budget` and `demo`.
- Modify: `packages/core-api/src/machines/jarvis.ts`: `JarvisState` gains `budget` and `demo`; `JarvisEntry` gains `brain`.
- Modify: `packages/core-logic/src/presenters/jarvisController.ts`: `JARVIS_INITIAL_STATE`, `JARVIS_SIM_AVAILABILITY`, the seeded availability cache, `availabilityPatch`, `planTurn`, `eventPatch`, and the switch line (R5).
- Modify: `packages/core-contract/src/harness/scriptedPorts.ts`, `src/suites/jarvisKit.ts` (`createAvailability`), `src/suites/jarvis.ts` and `src/suites/jarvisAvailability.ts`.
- Modify every `JarvisAvailability` and `JarvisState` literal the typecheck flags: the cores' tests, `ui-contract/src/shared/harness/world.ts`, `ui-contract/src/visual/fixtures.ts`, and both clients' fakes.

**Interfaces:**
- Consumes: the Task 1 `brain` variant and `JARVIS_BRAIN_NAMES`.
- Produces:
  - `JarvisAvailability.budget: JarvisBudgetView | null` and `JarvisAvailability.demo: boolean` (`JarvisBudgetView` is from `@rtc/domain`);
  - `JarvisState.budget: JarvisBudgetView | null` and `JarvisState.demo: boolean`, copied from availability by `availabilityPatch`;
  - `JarvisEntry.brain?: JarvisBrain`, set on a turn's jarvis entry by `planTurn` (the brain asked for) and overwritten by a `brain` event;
  - `JARVIS_SIM_AVAILABILITY = { available: true, brains: ["scripted"], defaultBrain: "scripted", gate: null, budget: null, demo: true }`;
  - `JARVIS_INITIAL_STATE.demo = false` and `JARVIS_INITIAL_STATE.budget = null`.

- [ ] **Step 1: Write the failing contract cases** in `core-contract`, so each runs against all three cores:
  - `jarvisAvailability`: an availability carrying `budget: { keyKind: "house", spentUsd: 0.06, limitUsd: 0.2, exhausted: null, resetsAtMs: … }` puts the same object on `state.budget`. A later availability with `budget: null` clears it.
  - `jarvisAvailability`: with no `availability$` (the simulator), `state.demo === true` and `state.budget === null`.
  - `jarvis`: a turn sent while `effectiveBrain` is `claude-haiku-4-5` creates its jarvis entry with `brain: "claude-haiku-4-5"`.
  - `jarvis`: a `brain: "scripted"` event on that turn changes the entry's `brain` to `"scripted"` and leaves its text unchanged.
  - `jarvis`: a turn whose port never emits `brain` keeps the brain it asked for after `done` (Review Focus 1).
  - `jarvis`: a `sendScripted` turn is tagged `scripted`.
  - `jarvisAvailability`: the switch line for `gate` plus `budget.exhausted: "user"` reads `Today's AI budget is used — switching to the scripted brain until 00:00 UTC.`; for `"house"` it reads `The house AI budget is used — switching to the scripted brain until 00:00 UTC.`; for `"unavailable"` it reads `The AI budget is unavailable — switching to the scripted brain.` Replace the old "Usage budget reached" assertions.
- [ ] **Step 2: Run and see them fail.** Command: `pnpm build --filter @rtc/core-contract... && pnpm --filter @rtc/client-core-rxjs --filter @rtc/client-core-async --filter @rtc/client-core-effect test`.
- [ ] **Step 3: Implement in `jarvisController.ts`.** The three cores need no change, because each calls `availabilityPatch` and `eventPatch`. Keep `modelFacingHistory` excluding `origin: "system"`.
- [ ] **Step 4: Run them and see them pass on all three cores.** Mutation-check: drop the copy into `state.budget`; ignore the `brain` event; stamp `scripted` in `planTurn` for every turn.
- [ ] **Step 5: Commit.** `feat(core): budget, demo and per-reply brain in JarvisState`.

### Task 3: The client adapter reads the brain frame and the budget, and the indicators preference exists

**Files:**
- Modify: `packages/client-adapters/src/adapters/WsJarvisAdapter.ts`: `attachJarvisTurnListeners` (the `jarvis.brain` listener), `parseAvailability` (a new `parseBudget`, plus `demo: false`), and `jarvisAvailabilityEquals` (compare `budget` and `demo`).
- Test: `WsJarvisAdapter.test.ts` and `wsRealJarvis.contract.test.ts`, which already build availability literals.
- Modify, adding the preference: every site listed under "Preference sites" below.

**Interfaces:**
- Produces, in `@rtc/domain` (`preferences.ts`, re-exported):
  - `interface JarvisIndicators { readonly readout: boolean; readonly replyTags: boolean; readonly brainPill: boolean }`;
  - `DEFAULT_JARVIS_INDICATORS = { readout: true, replyTags: true, brainPill: false }`;
  - `readJarvisIndicators(stored: unknown): JarvisIndicators`, which takes each boolean field that is present and defaults the rest;
  - `jarvisIndicatorsEqual(a, b): boolean`.
- Produces, on the preferences port: `jarvisIndicators$(): Observable<JarvisIndicators>` and `setJarvisIndicators(next: JarvisIndicators): void`. Storage key `rt-jarvis-indicators`, stored as JSON.
- Produces, on `JarvisPreferencesPresenter` (core-api): `indicators$: Stream<JarvisIndicators>` and `setIndicators(next: JarvisIndicators): void`.
- Produces, on `UseJarvisPreferencesResult` (both bindings): `indicators` and `setIndicators`.
- Produces, in the ui-contract harness: `mount({ jarvisIndicators })` and a world command-log entry for `setJarvisIndicators`.
- Produces, in `AppData` (`ui-contract/src/visual/appData.ts`): `jarvisIndicators?: JarvisIndicators`, which both `buildFakeViewModel.ts` files read, falling back to the default.

**Preference sites:** use `jarvisNarrator` as the template; it is in the same Jarvis group. The sites are:
- the domain: `preferences.ts`, `index.ts`, `ports/preferencesPort.ts`, `simulators/PreferencesSimulator.ts` and `ports/__contracts__/PreferencesPortContract.ts`;
- the storage adapters: `web-boot/src/adapters/LocalStoragePreferencesAdapter.ts` with `preferences.contract.test.ts`, and `client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts` with its test;
- the presenter: `core-api/src/presenters/jarvisPreferences.ts`, then `client-core-rxjs/src/presenters/JarvisPreferencesPresenter.ts`, `client-core-async/src/presenters/groupedPreferences.ts` and `client-core-effect/src/presenters/groupedPreferences.ts`, each with its test, plus `core-contract/src/suites/jarvisPreferences.ts`;
- the bindings: both `createViewModel.ts`;
- the ui-contract harness: `world.ts` and `mount.ts`;
- the clients' test view models: both `viewModelFromWorld.ts` and both `buildFakeViewModel.ts`;
- the e2e seed: `tests/browser/authSeed.ts`, if it mirrors the narrator key.

Run `pnpm check:manifest-drift` after editing them.

- [ ] **Step 1: Write the failing tests.**
  - Adapter: a `jarvis.brain` frame for the current turn yields `{ type: "brain", brain }`, and one for another `turnId` is ignored. An availability payload with `budget` keeps every field, and one without it gives `budget: null`. A malformed `budget` (a non-numeric `spentUsd`, an unknown `exhausted`) gives `budget: null`, not a throw. Two availabilities that differ only in `budget.spentUsd` are both emitted.
  - Domain: `readJarvisIndicators` with each of `undefined`, `"garbage"`, `{ readout: false }`, `{ readout: "no", brainPill: true, extra: 1 }` and the full record. The expected results are the defaults; the defaults with `readout: false`; the defaults with `brainPill: true`; and the full record (Review Focus 5).
  - Port contract, so every adapter runs it: the default replays first; a `setJarvisIndicators` replays the new value and persists it across a new adapter instance; it does not affect `jarvisNarrator`. In the web adapter test, a stored garbled string loads as the defaults.
  - `core-contract/suites/jarvisPreferences.ts`: `indicators$` replays the default; `setIndicators` is independent of `brain$`, `effort$` and `narrator$`.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement** the adapter parse and the preference through every site.
- [ ] **Step 4: Run and see them pass.** Run `pnpm typecheck`, then `pnpm test` (all packages; the port contract spans adapters). Mutation-check: drop the brain listener; drop `budget` from the equality; make `readJarvisIndicators` return the defaults whenever any field is invalid.
- [ ] **Step 5: Commit**, as two commits: `feat(client): the Jarvis adapter reads the brain frame and the budget`, then `feat(prefs): the Jarvis indicators preference`.

### Task 4: The pure copy — readout, tag and pill

**Files:**
- Create: `packages/core-logic/src/presenters/jarvisBrainIndicators.ts`, exported from the package index.
- Test: `packages/core-logic/src/presenters/jarvisBrainIndicators.test.ts`.

**Interfaces:**
- Consumes: `JarvisState` fields `available`, `effectiveBrain`, `budget` and `demo` (Task 2); `JARVIS_BRAIN_NAMES` (Task 1); `JARVIS_BRAIN_LABELS`.
- Produces:
  - `interface BrainReadout { readonly text: string; readonly tone: "normal" | "warning"; readonly meterFraction: number | null }`
  - `describeBrainReadout(state: Pick<JarvisState, "available" | "effectiveBrain" | "budget" | "demo">): BrainReadout | null`. It returns `null` when `!available`.
  - `describeReplyTag(brain: JarvisBrain): string`, which is `JARVIS_BRAIN_NAMES[brain]`.
  - `describeBrainPill(state: …same Pick…): string`. For example `Haiku 4.5 · $0.14 left` or `Scripted`.
  - `formatUsd(amount: number): string`, two decimals, clamped at 0.

- [ ] **Step 1: Write the failing table test.** Each row gives an input and the exact expected `text`, `tone` and `meterFraction`. All amounts use limit $0.20 unless stated.

  | Input | text | tone | meterFraction |
  |---|---|---|---|
  | `demo: true`, scripted | `Scripted · demo` | normal | `null` |
  | live, scripted by choice, budget not exhausted | `Scripted` | normal | `null` |
  | live, `claude-haiku-4-5`, spent 0.06 | `Claude Haiku 4.5 · house key · $0.14 of $0.20 left today` | normal | `0.7` |
  | live, `claude-sonnet-5`, spent 0.25 (overshoot) | `Claude Sonnet 5 · house key · $0.00 of $0.20 left today` | normal | `0` |
  | live, `claude-opus-5`, `limitUsd: null` | `Claude Opus 5 · house key · no personal limit` | normal | `null` |
  | live, haiku, `budget: null` | `Claude Haiku 4.5 · house key` | normal | `null` |
  | scripted, exhausted `user` | `Scripted · today's AI budget used · back at 00:00 UTC` | warning | `null` |
  | scripted, exhausted `forced` | `Scripted · today's AI budget used · back at 00:00 UTC` | warning | `null` |
  | scripted, exhausted `house` | `Scripted · house AI budget used · back at 00:00 UTC` | warning | `null` |
  | scripted, exhausted `unavailable` | `Scripted · AI budget unavailable` | warning | `null` |

  In addition:
  - `available: false` gives `null`.
  - The pill: Haiku with spent 0.06 gives `Haiku 4.5 · $0.14 left`; no budget gives `Haiku 4.5`; scripted gives `Scripted`.
  - The tag: `claude-sonnet-5` gives `Claude Sonnet 5`.
- [ ] **Step 2: Run and see it fail.** Command: `pnpm --filter @rtc/core-logic test -- jarvisBrainIndicators`.
- [ ] **Step 3: Implement.** Use `formatUsd` for every amount, and compute `meterFraction` as `max(0, limit − spent) / limit`.
- [ ] **Step 4: Run and see it pass.** Mutation-check: remove the clamp; swap the `house` and `user` copy; return a meter when `limitUsd` is `null`.
- [ ] **Step 5: Commit.** `feat(core-logic): the brain indicator copy`.

### Task 5: Header readout and reply tags in both overlays

**Files:**
- Modify: `packages/client-react/src/ui/shell/jarvis/JarvisOverlay.tsx` and `packages/client-solid/src/ui/shell/jarvis/JarvisOverlay.tsx`.
- Modify: the two `JarvisOverlay.module.css` files, which must stay byte-identical.
- Modify: `packages/ui-contract/src/shared/pages/shell/jarvis/JarvisOverlayPage.ts`, which gains `readoutText()`, `readoutTone()`, `readoutMeterFraction()` and a `tag` field on `JarvisEntryView`.
- Test: `packages/ui-contract/src/specs/shell/jarvis/JarvisOverlay.contract.spec.ts`, which both clients run.

**Interfaces:**
- Consumes: `describeBrainReadout` and `describeReplyTag` (Task 4); `useJarvisPreferences().indicators` (Task 3); `JarvisEntry.brain` (Task 2).
- Produces:
  - the readout, under the status line: `data-testid="jarvis-brain-readout"`, `data-tone`, and a child `jarvis-brain-meter` whose fill width is `meterFraction × 100%`;
  - on each tagged entry, `data-testid="jarvis-entry-brain"`.

- [ ] **Step 1: Write the failing contract cases.**
  - With the default indicators and a live Haiku availability whose budget has 0.06 spent, the readout text equals the Task 4 string and the meter reads 0.7.
  - With an exhausted `user` budget, the tone is `warning`.
  - With `mount({ jarvisIndicators: { …default, readout: false } })` there is no readout.
  - A reply in a turn that received `brain: "scripted"` is tagged `Scripted`.
  - A reply with no brain event is tagged with the brain asked for.
  - With `replyTags: false`, no entry has a tag.
  - User entries, the greeting and `origin: "system"` lines are never tagged.
- [ ] **Step 2: Run and see them fail**, in both clients' `test:ui:contract`.
- [ ] **Step 3: Implement**, identically in both clients.
  - The meter's width is set inline with no transition (Global Constraints).
  - Visible text is sentence case, made upper case by CSS.
  - The readout's container carries `aria-live="polite"` only if the status line already has one; otherwise none, because it changes between turns, not during them.
- [ ] **Step 4: Run and see them pass** in both clients, and check `cssParity.test.ts`. Mutation-check in both clients: ignore `readout: false`; tag `system` entries.
- [ ] **Step 5: Commit.** `feat(client): the Jarvis brain readout and reply tags`.

### Task 6: The input-bar brain pill and the Preferences switches

**Files:**
- Create: `JarvisBrainPill.tsx` in `packages/client-react/src/ui/shell/jarvis/` and in `packages/client-solid/src/ui/shell/jarvis/`, each with a byte-identical `JarvisBrainPill.module.css`.
- Modify: both `JarvisOverlay.tsx` (render the pill inside `div.inputRow` when `indicators.brainPill` is on); both `PreferencesContent.tsx` (three toggle rows under the Brain picker); the file-header row counts in those files.
- Modify: `JarvisOverlayPage.ts` (pill accessors) and `shared/pages/shell/prefs/PreferencesModalPage.ts` (the three toggles).
- Test: `JarvisOverlay.contract.spec.ts` and `PreferencesModal.contract.spec.ts`.

**Interfaces:**
- Consumes: `describeBrainPill` (Task 4); `useJarvisPreferences().setBrain`, `indicators` and `setIndicators` (Task 3); `JarvisState.brains` and `gate`.
- Produces the pill and its menu:
  - The button is `data-testid="jarvis-brain-pill"`, with `aria-haspopup="menu"` and `aria-expanded`.
  - The menu is `jarvis-brain-menu`. It has one `menuitemradio` per brain in `state.brains`, in `JARVIS_BRAINS` order, each `jarvis-brain-option-<brain>`, with `aria-checked` on the effective brain. Brains in `gate.gated` are disabled, matching the rule in `PreferencesContent`.
- Produces the toggles `pref-toggle-jarvisReadout`, `pref-toggle-jarvisReplyTags` and `pref-toggle-jarvisBrainPill`, each writing `setIndicators({ …current, <field>: next })`.

- [ ] **Step 1: Write the failing contract cases.**
  - The pill is absent by default and present with `brainPill: true`. Its text is the Task 4 pill string.
  - Clicking it opens the menu. The menu lists the offered brains, with gated ones disabled (Review Focus 4).
  - Choosing Sonnet records `setJarvisBrain("claude-sonnet-5")` in the world command log and closes the menu.
  - Escape with the menu open closes the menu and leaves the overlay open (Review Focus 3). A second Escape closes the overlay.
  - Focus returns to the pill after the menu closes.
  - In Preferences, each toggle shows its default and flipping one records `setJarvisIndicators` with only that field changed.
- [ ] **Step 2: Run and see them fail** in both clients.
- [ ] **Step 3: Implement**, identically in both clients.
  - Escape inside the menu stops propagation before the overlay's handler sees it.
  - The menu has no open or close animation.
  - Follow `docs/handler-naming.md` for the handlers.
- [ ] **Step 4: Run and see them pass** in both clients, plus `cssParity.test.ts` and `pnpm check:react-policies`. Mutation-check: let Escape propagate; leave gated brains enabled; have a toggle write the whole default record.
- [ ] **Step 5: Commit.** `feat(client): the Jarvis brain pill and the indicator switches`.

### Task 7: Visual scenarios

**Files:**
- Modify: `packages/ui-contract/src/visual/scenarios.ts`, `fixtures.ts` and `scenarioActions.ts` (`fullPage: true`, plus a click for the menu-open scenario).
- Goldens: generated by the controller with `update-visual-goldens.yml`; never written by hand.

**Interfaces:**
- Consumes: `AppData.jarvis` (now carrying `budget`, `demo` and the entry `brain`) and `AppData.jarvisIndicators` (Task 3).

- [ ] **Step 1: Add the scenarios.** All use the `JarvisOverlay` component key and a short transcript with two replies, one tagged Haiku and one tagged Scripted after a switch line:

  | Scenario | State |
  |---|---|
  | `jarvis/indicators-house-live` | Haiku, $0.06 spent of $0.20 |
  | `jarvis/indicators-no-limit` | Opus, `limitUsd: null` |
  | `jarvis/indicators-spent` | scripted, exhausted `user` (amber) |
  | `jarvis/indicators-house-spent` | scripted, exhausted `house` |
  | `jarvis/indicators-unavailable` | scripted, exhausted `unavailable` |
  | `jarvis/indicators-demo` | `demo: true` |
  | `jarvis/indicators-all-off` | readout and tags off |
  | `jarvis/indicators-pill` | pill on, menu closed |
  | `jarvis/indicators-pill-menu` | pill on, menu open (scenario click) |

  The existing `jarvis/overlay-*` fixtures gain `budget` and `demo` values (live Haiku, $0.06 spent, `demo: false`), so their goldens show the default readout and tags.
- [ ] **Step 2: Run the visual tier locally for `jarvis/` on both clients** to confirm the scenarios render without errors. Local goldens may differ; the committed x86 set is regenerated in the closing batch with `scenario_pattern=jarvis/`. Read Playwright's full summary; never pipe it through a filter.
- [ ] **Step 3: Commit.** `test(visual): brain indicator scenarios`.

### Task 8: Docs and STATUS

**Files:**
- Modify: `docs/architecture/18-jarvis-ai-agent-surface.md` (the `jarvis.brain` frame, the budget on the client, the indicators); `docs/running-real-jarvis.md` (what the readout shows and when); `packages/shared` and `packages/domain` READMEs, if they list Jarvis wire messages or preferences; `docs/STATUS.md` (B3b merged; the order line becomes B3c → B4; rollout: server plus both web clients).
- Modify: `docs/DEPLOY.md`, adding a short "Rolling out B3b" section beside the B3a one.

- [ ] **Step 1: Write the docs.**
- [ ] **Step 2: Run `pnpm check:doc-links`.**
- [ ] **Step 3: Commit.** `docs: the Jarvis brain indicators`.
