# RN prototype reference shots — a deviation corpus

**Status:** design agreed, plan not yet written.
**Prototype (the frozen source):** `docs/design/mobile/v1/standalone/Reactive Trader Mobile.html`
(editable twin: `docs/design/mobile/v1/dev-handoff/prototype/source/Reactive Trader Mobile.dc.html`).
**App side (read-only input):** `packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/`.
**Backlog entry this closes:** `docs/STATUS.md` → "Prototype reference shots — a DEVIATION corpus, not a golden set".

## 1. Goal

Pre-generate a set of screenshots of the **mobile-v1 prototype**, mirrored against
the React Native app's own visual goldens, so that the question

> *how far has the app drifted from the design, and where?*

is answerable **from a phone** — with no laptop, no simulator, no Metro, and no
served prototype.

Today that question needs all four at once, which is why it only ever gets asked
at the end of a phase, on the one machine that can ask it.

## 2. What this is NOT

This corpus is **not regression testing**, and the distinction is the whole
design. The prototype is frozen: it cannot change and it cannot break, so there
is nothing to regress and a diff against it is **never a failure**. A permanently
non-zero diff is the expected steady state.

Three rules follow, each easy to get wrong and each carried into the corpus's own
README rather than left here:

| # | Rule | Why |
|---|---|---|
| **(a)** | **Never a CI gate** | A permanently-nonzero diff is not a failing test. Wiring it up as one produces a gate that is either always red or has had its tolerance widened until it asserts nothing. |
| **(b)** | **Never auto-updated** — and in particular never "reconciled" by re-shooting the prototype to match the app | Re-shooting erases the entire signal. The gap *is* the artifact. |
| **(c)** | **Mirror the app's structure and naming** — same scenario ids, same directory shape, same file names | So mapping app↔prototype is mechanical rather than a lookup, both for a human skimming two folders and for an LLM asked to compare them. |

Rule (a) is enforced **structurally**: the corpus lives under `docs/`, where no
test runner globs and nothing can mistake it for a fixture. It is deliberately
kept out of `__screenshots__/`.

## 3. Deliverables

```
docs/design/mobile/v1/
  standalone/Reactive Trader Mobile.html   ← exists; the frozen source
  reference-shots/
    README.md                              ← the three rules, in the folder they govern
    DRIFT.md                               ← generated: app vs prototype, side by side
    <id>.png                               ← mirrored ids (blotter/seeded.png, boot/core.png, …)
    filmstrips/<id>.png                    ← prototype-only ceremony strips

scripts/
  prototype-shots/
    shots.ts                               ← the manifest (pure data, Node-safe)
    capture.ts                             ← drives the prototype, writes PNGs
    render-drift.ts                        ← reads both trees, writes DRIFT.md
  check-prototype-shots.mjs                ← manifest ↔ tree consistency gate
```

Plus two root `package.json` scripts: `prototype-shots:capture` (manual, never
CI) and `check:prototype-shots` (joins CI's `checks` job).

### 3.1 `DRIFT.md` is Markdown, not HTML

The stated purpose is reading this **on a phone**. A committed HTML page does not
render on github.com — it would mean downloading a file or standing up hosting.
**Markdown renders**, in the mobile browser and in the GitHub app, with images,
for free, today. So the comparison page is Markdown: a two-column table per
scenario, app left, prototype right, unpaired entries called out explicitly.

## 4. Architecture

Four units, each with one job and a declared dependency edge:

| unit | job | depends on |
|---|---|---|
| `shots.ts` | Pure data: the shot list. Id, `localStorage` seed, click path, arrival assertion, pin instant, `appTwin: boolean`. No Playwright import. | nothing |
| `capture.ts` | Drives the prototype in Playwright and writes PNGs. Knows nothing about *which* shots exist. | `shots.ts`, playwright |
| `render-drift.ts` | Reads the manifest + both PNG trees, writes `DRIFT.md`. Captures nothing. | `shots.ts`, fs |
| `check-prototype-shots.mjs` | Asserts manifest ↔ tree agreement, both directions. | `shots.ts`, fs |

This is the same split `tests/visual/scenarioIds.ts` / `driver.ts` already has on
the app side, for the reason recorded in that file's header: the pure list stays
importable by anything, so the gate and the generator do not drag a browser
dependency behind them.

### 4.1 Wiring consequences

Two, both verified against the tree rather than assumed:

- **`tsconfig.eslint.json` includes `scripts/*.ts` — one level only.** A nested
  `scripts/prototype-shots/` would sit outside the type-aware ESLint tier, a
  silent gap. The include must widen to `scripts/**/*.ts`.
- **Root has `tsx` and `vitest` but not Playwright** — it lives in
  `packages/client-react` at `^1.60.0`. Root gains it at **that same range**, not
  "latest": syncpack enforces a single range per dependency repo-wide.

### 4.2 Why the gate is a `check-*.mjs`, not a vitest spec

Root-level vitest is not picked up by `pnpm test`, which runs per-package. The
repo already has an established family for repo-level consistency gates —
`check-doc-links.mjs`, `check-worklet-order.mjs`, `check-image-tag-drift.mjs`,
`check-manifest-drift.mjs` — run from CI's `checks` job. This joins it.
`/rtc:gauntlet` re-reads `ci.yml` on every run, so it picks the new gate up
without a manual edit.

**This does not violate rule (a).** Rule (a) forbids a *diff* gate: asserting
prototype pixels against app pixels, where a non-zero result is not a failure.
Asserting that every manifest entry has a file on disk is a consistency check,
and it can be green.

It exists because this repo has already been bitten by exactly the gap it
closes. **T9**: the Maestro tier had drifted to 3 committed flows against 8
scenario ids and nothing noticed, because `generateFlows.test.ts` exercised the
pure generator function and never looked at the directory. The recorded
diagnosis — *"a generated artifact committed beside its generator with no test
tying the two together"* — describes this corpus precisely.

## 5. The pins

Every shot is reached by seeding `localStorage` before load, then a short click
path. Three pins make that deterministic:

| pin | value | source of the value |
|---|---|---|
| viewport | 402 × 874, `deviceScaleFactor: 3` | `device-frames.jsx:204` — yields 1206 × 2622, **identical** to the app goldens (measured on `boot/core.png`) |
| theme | `rtm_theme='holo3d'`, `rtm_mode='dark'` | what `tests/visual/scenarios.tsx` pins for 15 of 16 app scenarios |
| boot instant | t = 2.52 s | `fixtures.tsx`'s `BOOT_SCENE_ELAPSED_SEC` — so both sides show the same frame of the same animation |

The one app scenario that differs, `shell/connection-banner` at
`classic`/`light`, would take the same treatment — but it has no prototype twin
(§6.2).

### 5.1 The viewport coincidence is load-bearing

The prototype's simulated screen is **exactly** the iPhone 17 logical viewport
the app goldens are captured at. So a prototype shot cropped to the screen
element is pixel-dimension-identical to its app twin: not merely comparable
side by side but *alignable* — overlayable, blinkable.

Had the prototype been drawn at, say, 390 × 844, every comparison would have
needed a scale step, and a scale step means resampling — after which a 2px
spacing error is indistinguishable from an interpolation artifact. The corpus
would still have caught gross drift and been useless for the fine kind.

The **bezel is cropped**: the shot is the 402 × 874 screen element only, matching
what simctl captures. Both sides carry corresponding chrome — the prototype
draws its own status bar and dynamic island (`device-frames.jsx:30-50`, `:218`),
and the app's simctl driver now pins the real one to 09:41 / charged / full bars
(T8's fix).

### 5.2 Boot variant selection

The prototype computes `seq = (stored + 1) % 8` on load and writes it back
(`dc.html:1032`). So seeding `rtm_bootSeq = (N + 7) % 8` lands deterministically
on variant `N`. The variant→name mapping is read from `dc.html:1035`:

| seq | prototype name | app id |
|---|---|---|
| 0 | CORE SYNC | `boot/core` |
| 1 | UI DRAW-IN | `boot/laser` |
| 2 | DOCKING CAM | `boot/docking` |
| 3 | HOLO PROJECTOR | `boot/hologram` |
| 4 | GEO TACTICAL | `boot/geo` |
| 5 | LAYER COMPOSITOR | `boot/layers` |
| 6 | SCHEMATIC CORE | `boot/jarvis` |
| 7 | VOL TERRAIN | `boot/topo` |

## 6. Scope — the shot list

Every mapping below was verified in the prototype source, not inferred.

### 6.1 Paired — 14 of the app's 16 scenario ids

| app id | prototype route |
|---|---|
| `boot/{core,laser,docking,hologram,geo,layers,jarvis,topo}` | `rtm_bootSeq` per §5.2 |
| `lock/hold` | ⌖ → hold ring to `LOCK_HOLD_PROGRESS` (0.55) |
| `shell/appearance` | ◐ |
| `blotter/seeded` | dock → BLOTTER |
| `analytics/dashboard` | dock → ANALYTICS |
| `credit/rfq-tiles` | dock → CREDIT (`credView: 'rfqs'`) |
| `credit/sell-side` | dock → CREDIT → SELL (`credView: 'sell'`) |

### 6.2 App-only — 2 ids, deliberate holes

- **`boot/static`** — the app's own no-canvas fallback. The prototype has no such
  state.
- **`shell/connection-banner`** — **the prototype has no connection banner at
  all.** Verified: every `SIM`/`LIVE` string in the file is boot-canvas telemetry
  text (`dc.html:1298`, `:1788`, `:1861`, `:2038`), not app chrome.

The second is itself a finding, and the reason the manifest is bidirectional: a
deviation corpus is usually framed as *where has the app fallen short of the
design*, but it should also surface **where the app grew something the design
never specified**. That is not necessarily wrong — the app has real connection
states a mock prototype does not — but it is invisible when you compare by
flipping between two screens and only notice what is missing.

### 6.3 Prototype-only — 7 shots

Where the corpus stops being a mirror and becomes a design reference. Every id
keeps the `<group>/<name>` shape the app's ids use, so the mirroring rule holds
for unpaired entries too:

| shot | why there is no twin |
|---|---|
| `rates/grid`, `rates/ticket` | the app `rates` golden was never pinned (T6) |
| `equities/{markets,trade,blotter}` | `eqTabs` at `dc.html:2284`; the module is unbuilt — this is Phase 5b's reference |
| `credit/new-rfq` | `credView: 'new'` |
| `shell/dock-open` | dock fanned |

### 6.4 Filmstrips — 3, prototype-only

One PNG per ceremony, the same animation at 3–4 pinned instants left-to-right:
`rates/exec-ceremony` (ready→busy→scan→filled), `credit/accept-ceremony`,
`credit/countdown-ring`.

**Why prototype-only.** The prototype side of a motion reference is cheap and
laptop-free — it is a browser. The app side needs a booted simulator and a human,
which is the exact bottleneck this corpus exists to route around; capturing both
sides would re-introduce the dependency it removes. Until an app counterpart
exists, the filmstrip is still the reference to hold a running device against.

They earn their place because 5a's open items are disproportionately motion:
**T25** (the accept ceremony was invisible on device, and no still would have
shown that), the countdown ring's glide, the ACCEPT halo loop, the `AWAITING…`
pulse, and **T24**'s unconfirmed blank-flash, which the ledger says explicitly
"needs a clean reproduction, record video across the tap".

### 6.5 Totals

21 stills + 3 filmstrips = **24 PNGs**. Of the 21 stills: 14 paired, 7
unpaired-prototype. Plus 2 unpaired-app ids (§6.2) which contribute no prototype
file, only a `DRIFT.md` row.

**Repo weight is a non-issue and the design does not accommodate it.** At ~350 KB
per shot this is ~8 MB, against 154 MB across 3,059 PNGs already committed in
`packages/ui-contract/goldens/`.

### 6.6 One theme, deliberately

6 skins × 2 modes would turn 24 shots into ~290. That is precisely the trap the
web visual tier walked into — its ×10 theme matrix is still an open STATUS item,
described there as "the remaining visual-time lever" at 1282 scenarios. The
corpus pins one theme (§5) and does not cross-product.

## 7. Failure handling

Every shot in the manifest declares **what proves it arrived** — the header
MODULE label reading `CREDIT`, the appearance sheet's title, the boot canvas
being present — and capture **throws rather than writing a PNG** when that
assertion fails.

Positive assertion, never absence-of-a-known-bad-state. The app's own harness
learned this twice:

- **T2** — a failed deep link screenshotted the Expo launcher and reported it as
  a large visual regression.
- **T7** — every scenario after the first in a run was driving a dead app, and
  `waitForAppBoot` passed it as booted because it only rejected the *Expo*
  launcher.

The recorded diagnosis for both is *"inferring a good state from the absence of
one known-bad state."* This corpus does not repeat it.

## 8. Known risk — the boot instant

The prototype animates on `requestAnimationFrame` against `performance.now()`
(`dc.html:1032`), plus intervals for prices, clock and candle ticks. Two distinct
needs:

1. **Boot shots at exactly t = 2.52 s.**
2. **Non-boot shots not caught mid-transition** (the ~200 ms tab/filter fades).

(2) is satisfied by a settle-wait after the click path. (1) is the open one:
Playwright's `page.clock` controls `setTimeout`/`setInterval`/`Date` but **not**
rAF, and the boot loop runs on rAF. Whether that is drivable cleanly is unproven.

**The plan's first task is a spike on this**, with a declared fallback: capture
on a timed delay and accept ±1–2 frames. The fallback is acceptable *because of
rule (b)* — the corpus is never compared against itself, so frame-exactness buys
nothing. Being at t ≈ 2.5 s rather than t = 0.3 s is the entire requirement.

More generally: the prototype's live data (ticking prices, running clock) does
**not** need freezing for correctness. A shot is taken once and never reproduced,
so variance is not a defect. Determinism is wanted only for *legibility* — not
catching a frame mid-fade.

## 9. Deliberately not built

- **No diff gate**, in CI or locally (rule (a)).
- **No auto-update path** (rule (b)).
- **No app-side re-capture.** The 14 existing goldens are read, never rewritten.
  This is a safety property, not a scope limit: those goldens were captured,
  eyeballed and verified over a full session on 2026-08-01, and 13 of 14
  reproduce at exactly 0.00%. Any tooling that *could* rewrite them is a path by
  which unreviewed pixels enter the tree — which is how the earlier
  `--update-snapshots` default-mode bug shipped a golden nobody had looked at.
- **No app-side filmstrips** (§6.4).
- **No theme cross-product** (§6.6).
- **No prototype changes.** It is frozen; that is what makes it a reference.

## 10. Success criteria

1. `docs/design/mobile/v1/reference-shots/` holds 24 committed PNGs, each
   eyeballed by a human before commit.
2. Every paired shot is 1206 × 2622, dimension-identical to its app twin.
3. `DRIFT.md` renders on github.com from a phone, pairing all 14 twins and
   naming every unpaired entry in both directions.
4. `pnpm check:prototype-shots` passes, and fails when a manifest entry has no
   file or a file has no manifest entry (both verified by deliberate breakage).
5. The corpus answers, without a laptop, the question that gates 5a's refinement
   pass: *where is the app furthest from the design?*
