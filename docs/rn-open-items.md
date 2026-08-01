# RN mobile-v1 — open items, wrinkles and follow-ups

Every known gap, deferred decision and unresolved wrinkle in the React Native
workstream, in one place. [STATUS.md](STATUS.md) remains the authoritative
*pending-work backlog* and links here; this page is the detail behind its RN
bullets, including items too small or too cross-cutting to earn their own
backlog entry.

Nothing here is a blocker on shipped work. Items are grouped by what kind of
thing they are, because that determines who fixes them and where.

**Last updated: 2026-08-01**

---

## 1. Data-model mismatches — shared by BOTH clients

These live in `@rtc/domain` / `@rtc/client-core`, below the UI and above both
clients, so they are **not** RN-only: the web client has the same gaps, it just
does not exercise them. Full table with per-item workaround vs. model change in
the [Phase 5 design §8.1](superpowers/specs/2026-07-25-rn-mobile-v1-rehaul-phase-5-design.md).

| # | Gap | Fix direction |
|---|---|---|
| M1 | No "quotes I submitted" history projection for sell-side | Add a durable submitted-quote projection keyed by quote id |
| M2 | `CreateRfqInput.dealerIds` required, but the prototype has no dealer picker | Make it optional, server defaults to all dealers |
| M3 | RFQ window is 120 s in the domain vs 45 s in the prototype | Pick one; a 120 s ring barely moves on a phone |
| M4 | No equities tick-history stream (sparklines derive from OHLC candles) | Add one mirroring the FX `usePriceHistory` |
| M5 | A fill is a binary animation intent — no lifecycle event carrying qty/price/outcome | Emit a proper order-lifecycle event |
| ~~M6~~ | ~~`AnalyticsSimulator` emits a frozen `STATIC_POSITIONS` constant every time; two of the three Analytics widgets read it~~ | **FIXED 2026-07-26 (5c Task 1).** Positions now drift each tick — a mean-reverting step around the original values, so the book wanders without walking away. The web client gains it for free, since the simulator sits below both. Consequence worth knowing: Analytics is now doubly non-deterministic (this drift *plus* the pre-existing `Math.random` history seed), which is why its visual scenario mounts `AnalyticsDashboard` over a literal book rather than the simulator. |
| M7 | Analytics history appends every 10 s vs the prototype's 1 s mock | Raise cadence or interpolate client-side |

## 2. Gaps against the reference implementation

Not against our design prototype — against Adaptive's actual ReactiveTraderCloud,
the product this repo recreates.

| # | Gap | Notes |
|---|---|---|
| R1 | **Exposure bubbles are draggable upstream; ours are inert in both clients.** Verified: no pointer/mouse/touch handler in either `PositionsPanel`, and RN's are statically shelf-packed. | Cheaper than first recorded. An earlier draft claimed drag threatens pinned visual goldens — **that was wrong, and is corrected here**: what threatens a golden is a *force-directed simulation settling over time*, not drag. A golden never drags, so an un-dragged layout is exactly as stable as today's, and the harness could disable drag outright if it ever mattered. Keep the deterministic shelf-packed layout and add drag on top. |

## 3. RN rendering wrinkles (no web analogue)

| # | Wrinkle | State |
|---|---|---|
| **P1** | **Skia text rendered NOTHING in the boot scenes.** `Skia.Font()` was built with no typeface; on real iOS that draws zero glyphs silently, with no throw. `core`'s banner/telemetry and `docking`'s ~20 readouts were absent from the on-device goldens — **and from Phase 6a's golden too, so it shipped unnoticed.** | **FIXED 2026-07-26.** Fonts now come from `bootSceneFonts.ts` — bundled JetBrains Mono (the web boot canvas's own stack), built in React-land and captured by the draw closure, never inside the worklet. The real 700 face is loaded too, so the three `bold` sites no longer render regular; that closes the separate weight gap as well. Verified on device; `boot/core` and `boot/docking` re-pinned. |
| **P1a** | **U+25C9 `◉`, the telemetry bullet every boot variant uses, is in NO bundled face** — verified against the cmap of JetBrains Mono, IBM Plex Mono, IBM Plex Sans and Chakra Petch. Every other symbol the scenes draw is covered. The web renders it because a CSS font stack falls back **per glyph** to the system monospace; a Skia font has one typeface and no fallback chain, so it drew a tofu box. | **FIXED 2026-07-26** — substituted with U+25CF `●` via `bootGlyphs.ts`, shared so 6b-2's five scenes inherit it. Worth knowing before adding any new symbol to a Skia-drawn string: check the cmap, because the web is not evidence. |
| P2 | `ctx.shadowBlur` bloom is not ported (5 sites). A per-frame `MaskFilter.MakeBlur` on a stroke is the mobile equivalent of the `filter` traps in [performance.md](performance.md). | Accepted non-goal. Revisit only if a scene reads flat on-device. |
| P3 | Skia has no `textBaseline: "middle"`; docking's range-dial rows sit baseline-anchored. | Accepted cosmetic gap — but no longer blocked behind P1, and now visible on device for the first time. Judge it against the re-pinned `boot/docking` golden before deciding whether to correct the offset. |
| P4 | RN Aurora ambient renders far too faint on-device. | Pre-existing; raise `t.aurora` / per-band opacities, revisit sway/skew geometry. |
| P5 | Power-saver **Freeze** renders the same as Calm on RN — no RN-side motion gating equivalent to the web's CSS catch-all. | Pre-existing. Means Freeze could not be verified on-device for Phase 4a. |
| P6 | `useMemo`'d `SkPath` captured in a worklet closure was flagged unproven (every other scene builds paths inside the worklet). | **RESOLVED 2026-07-25** — `DockingScene` uses it and renders correctly on-device. The documented fallback was not needed. |

## 4. Test and tooling wrinkles

| # | Wrinkle | State |
|---|---|---|
| **T1** | **The RN visual + e2e tiers gate nothing in CI** — iOS pixels need macOS, and every other workflow runs `ubuntu-latest`. The web visual tier *does* run post-merge. | **IN PROGRESS. The blocking premise was false and is now disproved by measurement.** This repo is PUBLIC, so GitHub-hosted macOS runners are free — access was never the obstacle. A `workflow_dispatch` spike ([`ios-visual-spike.yml`](../.github/workflows/ios-visual-spike.yml)) proved the environment on 2026-07-26 in **6 min 27 s**: `macos-26` instantiates and boots **iPhone 17 × iOS 26.5**, an exact match for the goldens' `ios-iphone17-26` pin. Two assumptions fell — **97 GB free, not 14 GB** (disk is a non-issue), and the image's `python3` is **3.14.6**, above `fb-idb`'s ≤ 3.13 ceiling, so **idb genuinely would not have installed** and Maestro is the right CI tier for a now-verified reason. Full numbers: [mobile-ci-testing-options.md §7.0](mobile-ci-testing-options.md). **Still open:** whether CI pixels match the Mac-local goldens (§5 predicts not, and the answer is a second golden bucket, never a wider tolerance — the 6% tolerance already dwarfs the 0.04% that the real #147 regression moved), and promotion to a scheduled non-gating workflow. **Never a PR gate** — see §4. |
| T2 | A capture failure was indistinguishable from a visual regression — a failed deep link screenshotted the Expo launcher and reported a large diff. | **FIXED** (#350 + #353): the driver asserts readiness via the a11y tree and throws rather than returning an unverified screenshot. |
| T3 | `testID` only surfaces in the iOS a11y tree for nodes that are themselves accessibility elements — a plain container `View` never appears. Marking the wrapper `accessible` surfaces it but collapses the subtree (measured 41 nodes → 3). | **FIXED** (#353): the readiness marker is a 1×1 empty accessible sibling. Worth remembering for any future harness marker. |
| **T7** | **Every scenario after the first in a multi-scenario capture run was driving a dead app.** Re-opening the dev-client URL against a running app tears it down to the iOS home screen instead of re-navigating it; `waitForAppBoot` then passed that as "booted" because it only rejected the *Expo* launcher. Same class as T2 — inferring a good state from the absence of one known-bad state — reproduced inside the fix for T2. | **FIXED 2026-07-26** (#TBD): each scenario cold-starts from an explicit `simctl terminate`, and SpringBoard is rejected alongside the Expo launcher. Cold-starting then exposed the dev client's "Tools" hint in frame, which is now waited out as a condition rather than slept past. |
| T8 | `blotter/seeded` and `shell/appearance` reproduced at **2.9%** and **4.0%**, not the 0.01–0.05% the other six sat at. Both passed on tolerance, so nothing was red, but that much run-to-run movement meant something time- or data-dependent was in frame. | **RESOLVED 2026-08-01 — it was the iOS status bar.** Its clock advances every minute and it is in frame on every capture, so each golden baked in a wall-clock that could never reproduce; battery level and the cellular glyph drift too. The simctl driver now pins all of it (`simctl status_bar override`, 09:41, charged, full bars) before each capture. Measured: with the bar pinned, two consecutive runs of the boot scenes differ by **0 pixels** in the body and only in the top 120 px before the fix. Whole suite went from 0.01–0.05% (and 2.9–4.0%) to **0.00%**. |
| T4 | `expo start` rewrote `packages/client-react-native/tsconfig.json` and removed `expo-env.d.ts` after every native session; the rewritten formatting failed `biome ci`. Any worktree that captured goldens picked it up. | **FIXED 2026-07-26** (#361). **The revert was the cause** — the churn was *convergent*, not oscillating, and reverting kept pushing the tree away from the fixed point Expo was steering toward. `@expo/cli`'s type generation takes its removal arm because `experiments.typedRoutes` is unset, and its `writeUpdates` is `if (updates.size)`-guarded: once those entries are absent there is nothing left to remove, so Expo stops writing the file entirely. Committing the converged state ended it permanently. Generalisable: check a tool's writer for an idempotence guard before assuming a permanent fight. |
| **T9** | **The Maestro tier had silently drifted and nothing noticed.** `tests/visual/maestro/flows/` held **3** committed flows against **8** `SCENARIO_IDS`, while `maestro/run.ts` iterates all 8 — so the tier could not complete a run. `generateFlows.test.ts` exercised only the pure `flowYaml()` function and never looked at the directory, so CI could not see it. Same class as the parked-Gherkin step-tree drift: a generated artifact committed beside its generator with no test tying the two together. | **DRIFT FIXED 2026-07-26** (found while scoping T1). The 5 missing flows were regenerated — the 3 pre-existing ones came back byte-identical, so the drift was purely *missing files*, not stale content — and `generateFlows.test.ts` gained two guards: the committed `.yaml` set must equal `SCENARIO_IDS`, and each file must match `flowYaml(id)` byte-for-byte. Both were verified to fail when they should: deleting a flow trips both, tampering with one trips only the byte check, so they are non-redundant. **RESIDUE — still open, and now WIDER:** only **3 of 14 `maestro` goldens exist**, and those three are **STALE as of 2026-08-01** — captured before the harness gained its themed background and safe-area inset, so they still pin the white-background / occluded-content frames the simctl tier just shed (T14, T17). They were left rather than silently re-shot: a maestro `:update` writes all 14 and every one needs a human to eyeball it, which is a second full session, and this tier gates nothing in CI. Re-baseline the whole tier in one pass rather than patch the three. That gap is deliberately *not* encoded as a test, because a golden can only come from a Mac-local `:update` against a booted simulator plus a human eyeballing each PNG (the harness README warns `:update` in a bad state will pin a screenshot of the Expo launcher as the baseline). A CI-enforceable "golden exists" gate would be permanently red with no CI-side remedy. |
| T5 | The CI "Expo bundle smoke" still tolerates a react-native-worklets Babel-plugin crash whose root cause was fixed in #289. | Pre-existing; verify `expo export` is clean on CI x86, then remove the tolerance. |
| T6 | Phase 3's `shell` golden and Phase 4a's `rates` golden are still not pinned. | Pre-existing. Now cheap — the harness is trustworthy and captures reproduce at 0.01–0.05%. |
| **T16** | **`boot/static` is the one golden that does not reproduce exactly (0.14%).** `BootEmblem` runs a 900 ms opacity pulse gated ONLY by the OS-level `AccessibilityInfo.isReduceMotionEnabled()` — the harness's `forceReduceMotion` seeds `animatedBackground` (the ambient layer alone) and power-saver `freeze` does not reach it either, so the emblem is captured at a random point in its pulse. | **OPEN, and it is really a slice of P5.** The repo's Freeze doctrine is that Freeze kills ALL motion; this pulse ignores it, so the fix is to route the emblem through `useBootMotionEnabled()` (which already encodes "Freeze always wins") rather than to special-case the harness. Deliberately NOT done in the golden session: it changes production motion behaviour and belongs with P5. Passing at 0.14% meanwhile. |
| **T17** | **Three scenarios mounted screen content with no safe-area inset, so the status bar and dynamic island covered their first rows** — and the goldens pinned that as correct. `blotter/seeded` lost its **`PENDING` filter chip entirely** (the golden asserted three filters where the app has four); `shell/connection-banner` lost the "Live" pill behind the clock; `analytics/dashboard` lost its "P&L" title. Separately `lock/hold` mounted the ring uncentred, so the island covered all but a sliver of the arc — while `LOCK_HOLD_PROGRESS = 0.55` exists precisely so the golden proves a PARTIAL fill. | **RESOLVED 2026-08-01.** New `ScreenContentFixture` applies the top inset (`flex: 1` on it is load-bearing — without it `BlotterModule` collapsed to an empty screen, which the first capture caught); `LockHoldFixture` now centres the ring like `LockScreen` does. Full-bleed surfaces (`boot/*`, `lock/hold`, `shell/appearance`) are deliberately NOT wrapped. **Found only by looking at the PNGs** — a diff against an equally-wrong baseline is green, so neither the tier nor its reproduction percentage could ever have surfaced these. Recipe recorded in the harness README. |
| **T10** | **`boot/topo` had no visual scenario** — the scene prints a **live wall-clock timestamp** bottom-left, so two golden captures minutes apart differ and the golden could never reproduce itself. | **RESOLVED 2026-08-01** via route (a), the preferred one: `BootSceneProps` gained an optional `now`, `BootSceneFixture` passes a fixed instant, and `TopoScene` prefers it over its mount-time `new Date()`. Production passes nothing and still samples the clock, so the live splash is unchanged. `boot/topo` is now registered (14 scenarios) and reproduces at **0.00%**. The footer stamp is KEPT rather than dropped, so the golden asserts the frame the app really draws. `now` is passed to every scene, not just `topo`, so a scene that starts printing the clock later inherits a pinned one instead of silently becoming unreproducible. |
| **T13** | **FIVE of the eight boot scenes rendered BLANK on device** — `hologram`, `layers`, `geo`, `jarvis`, `topo`. A white screen plus a continuous `TypeError: undefined is not a function`; one session logged 253. The live boot splash was affected too, not only the harness. Observed 2026-07-27, iPhone 17 / iOS 26.5. | **RESOLVED 2026-07-31 — all eight variants render on device.** There were **three** causes, not one, and only the first was visible to the detector as it stood: (1) 24 worklet→worklet forward references across five files; (2) a worklet reading a module-level **`const`** declared later (`LayersScene`'s `CORNER_UVS`) — the same capture-by-value rule applied to a constant, which is why `layers` stayed blank through a complete function reorder and why a function-only detector could never be sufficient; (3) a missing `"worklet"` directive on `topoGeometry.topoHeightAt`, found by the 2026-07-27 audit but never fixed (only its `geoPointInside` peer shipped, in #413). **The earlier "reordering does not fix it" finding was a measurement error, not a missing cause**: the detector's regex anchored on `^function`, so the `export function` `gyroYawPitch → clampUnit` reference in the shared `boot3dCamera.ts` was never reported, and `hologram` was reordered in its own file only. `check-worklet-order.mjs` now covers all three classes, resolves imports across the tree, strips comments, exits non-zero, and **is a CI gate** — verified to fail on the pre-fix sources (28 findings) and pass on the fix. Full write-up: [research/2026-07-27-rn-boot-scenes-blank-on-device.md](research/2026-07-27-rn-boot-scenes-blank-on-device.md). |
| **T14** | **The boot visual goldens were captured on a WHITE background.** `VisualScenarioHost`'s wrapper set no `backgroundColor`, so every `boot/*` golden showed its scene over white. | **RESOLVED 2026-08-01 — and the recorded scope was too narrow.** It was never a `boot/*` problem: **every fixture that mounts a LEAF rather than a screen** fell through to RN's default white — `lock/hold`, `boot/static` and `shell/connection-banner` were captured almost entirely white, and `blotter/seeded` had a dark header over a white body (mean 0.88). Fixed once, at the host, with `backgroundColor: t.bgPrimary` — theme-resolved, so the light-pinned `shell/connection-banner` gets classic-light's own background rather than a hardcoded dark. `shell/appearance` moved 0.5405 → 0.5399, the control proving full-screen scenarios were unaffected. |
| **T15** | **`SkPath.moveTo()` / `SkPath.lineTo()` are deprecated** in the installed react-native-skia (2.6.2), in favour of `Skia.PathBuilder.Make()`. Every boot scene building a polyline path hits them; ~22 warnings per session. | **OPEN, cosmetic.** Investigated during T13 and explicitly ruled OUT as a cause: both methods still exist and still work, and no scene calls a method that was actually removed (checked every path method used against the installed `Path.d.ts`). Worth a mechanical migration pass to quiet the log, no urgency. |
| **T12** | **No golden existed for `analytics/dashboard`, or for any of the five projected boot scenes.** | **RESOLVED 2026-08-01.** All **14** simctl goldens captured and eyeballed in one session, then verified: **13 of 14 reproduce at exactly 0.00%**, `boot/static` at 0.14% (see T16). Captured via `--scratch` and promoted by copying the reviewed bytes, never a second `--update` — re-capturing would commit pixels nobody looked at. |
| **T11** | **Four of the five projected scenes carry per-frame mutable state in the web** that a worklet cannot reproduce — it captures values rather than sharing a live closure. `geo` accumulates a `trades[]` array, `jarvis` shares a `ringZPlane` and writes `fragment.currentZ`, `topo` mutates `lastTickIdx`/`val`/`dir`/`flashStart` per peak. | **RESOLVED in the ports, worth remembering.** Each is now derived purely from `elapsedSec`, following `coreArcs.ts`'s `activeFlowArcs`. The failure mode is never a crash — it is silent divergence (rings sitting flat, cross-links at wrong depths, prices frozen), which is why each has a test pinning the *motion* rather than just the range. `geo`'s reconstruction is provably exact because the web's concurrent-trade cap can never bind; that is asserted. |

### Phase 5a Credit — carried forward (2026-08-01)

| # | Item | Detail |
|---|---|---|
| T18 | **5a's on-device sign-off has not run** | Plan Task 11 needs a booted simulator and a human. It is the ONLY witness for the whole Reanimated worklet class (§5): `pnpm check:worklet-order` is clean, and jest is structurally blind. Until it runs, the countdown ring's 1s glide, the ACCEPT halo loop and the `AWAITING…` pulse are unverified on a device. Its two goldens (`credit/rfq-tiles`, `credit/sell-side`) are registered but **not captured** — the Maestro flows exist, the PNGs do not. Queues into the single serial native tail. |
| T19 | **The sell-side ticket shows no counterparty** | The prototype's `CLIENT SELLS · {qty} · ADAPTIVE ASSET MGMT` has three segments; ours has two. `Rfq` carries no client identity in `@rtc/domain`, so the third was omitted rather than invented — a deliberate fidelity gap, not an oversight. Closing it means a domain/wire change (a counterparty on the RFQ), which Phase 5's §4 freezes. |
| T20 | **New-RFQ quantities are now four fixed chips** | `[1M, 2M, 5M, 10M]` (dc.html:2181), replacing free-text entry. That is the prototype's design and matches what the desk broadcasts, but an odd size is no longer expressible on mobile. The web client still takes any quantity. |
| T21 | **Instrument chips wrap; the plan said scroll** | Plan Task 7 specified a horizontal `ScrollView`; dc.html:262 draws a two-column grid. The grid was built instead — with more than six instruments a horizontal rail would push the overflow off-screen, which on a picker is worse than a taller grid. Noted so the deviation is not read as drift. |

## 5. The worklet hazard (standing, not a bug)

Any function reached from inside a Reanimated worklet must itself carry
`"worklet"`, transitively, including shared `@rtc/motion-core` helpers. A miss
throws `[Worklets] Tried to synchronously call a Remote Function` on a real
device. **jest is structurally blind to the entire class** — its Reanimated mock
runs worklets as plain JS with full module scope — so a green suite is never
evidence of device safety.

Known instances: #334 (`coreGeometry` default-parameter capture), #340
(`ringDashOffset` unmarked, so the lock ring never worked on any real device),
and one caught pre-merge during 6b-1 (`craftGridLines`, a build-once helper,
called per frame from inside a worklet).

The mitigation that actually worked: each geometry module records which exports
are per-frame (marked) and which are build-once (deliberately unmarked), turning
an invisible runtime contract into one the next task can read. Do not add the
directive to a builder to make a per-frame call legal — precompute and scale at
draw time instead.

**The second half of the rule, added 2026-07-31 (T13).** A missing directive is
only one of the two ways a worklet reaches something broken. The other is
**order**: a worklet's closure is captured BY VALUE at module evaluation, and
the Babel plugin rewrites `function foo()` into a non-hoisted binding, so *any
module-level binding declared later in the same file arrives as `undefined`* —
**constants exactly as much as functions**. That second clause is the one that
cost the most: `layers` stayed blank through a complete function reorder because
a single `const CORNER_UVS` sat below its first worklet reader. Imports are
immune (live module bindings, evaluated first), which is why moving a helper to
a sibling module is a permanent fix where reordering is a local one.

Both halves are now gated by `pnpm check:worklet-order` (CI `checks` job +
`/rtc:gauntlet` fast tier). It is necessary, not sufficient: it cannot see an
arrow-function worklet, a function passed as a value, or anything dynamic, and
no static check can prove a Skia scene draws what it should. **A clean report is
not evidence that a scene renders — only a device is.**

## 6. Deferred work with no plan yet

| Item | State |
|---|---|
| **Phase 5** (Credit / Equities / Analytics) | **5c (Analytics) is BUILT** — golden captured, on-device steps 1-4 + 6 verified and step 5 signed off (2026-08-01). Plan: [5c](superpowers/plans/2026-07-26-rn-mobile-v1-rehaul-phase-5c-analytics.md). **5a (Credit) is BUILT as of 2026-08-01** — countdown ring, best-quote tint + ACCEPT halo, `AWAITING…` pulse, accept ceremony with a timer-free linger, new-RFQ chip form, the shared 3-way filter, and the sell-side ticket list; two pinned visual scenarios registered. Plan: [5a](superpowers/plans/2026-08-01-rn-mobile-v1-rehaul-phase-5a-credit.md). **Its Task 11 on-device sign-off and golden capture are NOT done** (see T18). **5b (Equities) is designed but has no plan file and no implementation**, and is the larger of the two. |
| **Phase 6b — COMPLETE (porting)** | **All 8 boot variants are ported and registered** as of 2026-07-26: `core`/`laser` (6a), `docking` (6b-1), `hologram` + `layers` (6b-2a), `geo` + `jarvis` + `topo` (6b-2b). The last five share the `boot3dCamera` seam. Plans: [6b-2a](superpowers/plans/2026-07-26-rn-mobile-v1-rehaul-phase-6b-2a-boot-3d-foundation.md), [6b-2b](superpowers/plans/2026-07-26-rn-mobile-v1-rehaul-phase-6b-2b-boot-3d-remaining.md). **Still open: none of the five projected scenes has been run on a device**, and jest is structurally blind to the Reanimated worklet class, so the simulator remains the only witness. See T10 below. |
| **Phase 7** (cross-cutting polish + sign-off) | Untouched, last by definition. |
| `withAlpha()` helper / branded hex type | From #301 — colours are built by string-appending an alpha suffix; safe for today's accent tokens, silently invalid for any future `rgba()` one. |
| Equities workspace alignment | RN holds selection in local `useState`; `useEqWorkspace()` is the shared singleton the web client uses for cross-panel sync. |
| RN visual harness | An inset 3D-card scenario is still wanted, to guard the `overflow:hidden` shadow-clip regression class the current full-bleed scenario cannot catch. |

### Projection per boot scene — measured, do not re-derive

The 6b-1 scope note recorded that all five projected scenes clamp the near plane
at `0.4`. **They do not.** Each was read back from its own web variant while
porting 6b-2a:

| scene | `perspectiveK` | near-plane clamp | source |
|---|---|---|---|
| `hologram` | 0.26 | **none** | `bootHologram.ts:216` — `1 / (1 + depth * 0.26)` |
| `geo` | 0.22 | **none** | `bootGeo.ts:528` — `1 / (1 + depth * 0.22)` |
| `layers` | 0.24 | 0.4 | `bootLayers.ts:202` — `1 / Math.max(0.4, 1 + z2 * 0.24)` |
| `jarvis` | 0.30 | 0.4 | `bootJarvis.ts:166` — `1 / Math.max(0.4, 1 + depthZ * 0.3)` |
| `topo` | 0.26 | 0.4 | `bootTopo.ts:381` — `1 / Math.max(0.4, 1 + z2 * 0.26)` |

**All five rows are now read from source**, each with its line cited. Two of the
five — `hologram` and `geo` — have no clamp at all.

This is why [`boot3dCamera.ts`](../packages/client-react-native/src/ui/shell/boot/scenes/boot3dCamera.ts)
makes `minPerspectiveDenom` optional and never defaults it. Defaulting the clamp
on — the obvious convenience — diverges from the web at depth in the unclamped
scenes, in a way no unit test catches and only a side-by-side pixel comparison
shows.
