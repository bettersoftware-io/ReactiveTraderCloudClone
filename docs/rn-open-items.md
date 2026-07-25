# RN mobile-v1 — open items, wrinkles and follow-ups

Every known gap, deferred decision and unresolved wrinkle in the React Native
workstream, in one place. [STATUS.md](STATUS.md) remains the authoritative
*pending-work backlog* and links here; this page is the detail behind its RN
bullets, including items too small or too cross-cutting to earn their own
backlog entry.

Nothing here is a blocker on shipped work. Items are grouped by what kind of
thing they are, because that determines who fixes them and where.

**Last updated: 2026-07-25**

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
| **M6** | **`AnalyticsSimulator` emits a frozen `STATIC_POSITIONS` constant every time; two of the three Analytics widgets read it** | **Let positions drift. Decide BEFORE planning 5c — it determines whether most of that sub-phase's motion work is observable at all** |
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
| **P1** | **Skia text renders NOTHING in the boot scenes.** `Skia.Font()` is built with no typeface; on real iOS it does not throw, it silently draws zero glyphs. `core`'s status banner and `docking`'s ~20 readouts are absent from the on-device goldens — **and from Phase 6a's golden too, so this shipped unnoticed.** The documented belief was "renders regular weight instead of bold"; the reality is "renders nothing". | **OPEN — newly discovered 2026-07-25.** Needs a real typeface (bundled asset or `Skia.FontMgr.System().matchFamilyStyle(...)`). Affects every text-bearing boot scene, including 6b-2's `layers`/`topo`. |
| P2 | `ctx.shadowBlur` bloom is not ported (5 sites). A per-frame `MaskFilter.MakeBlur` on a stroke is the mobile equivalent of the `filter` traps in [performance.md](performance.md). | Accepted non-goal. Revisit only if a scene reads flat on-device. |
| P3 | Skia has no `textBaseline: "middle"`; docking's range-dial rows sit baseline-anchored. | Accepted cosmetic gap. Blocked behind P1 anyway. |
| P4 | RN Aurora ambient renders far too faint on-device. | Pre-existing; raise `t.aurora` / per-band opacities, revisit sway/skew geometry. |
| P5 | Power-saver **Freeze** renders the same as Calm on RN — no RN-side motion gating equivalent to the web's CSS catch-all. | Pre-existing. Means Freeze could not be verified on-device for Phase 4a. |
| P6 | `useMemo`'d `SkPath` captured in a worklet closure was flagged unproven (every other scene builds paths inside the worklet). | **RESOLVED 2026-07-25** — `DockingScene` uses it and renders correctly on-device. The documented fallback was not needed. |

## 4. Test and tooling wrinkles

| # | Wrinkle | State |
|---|---|---|
| **T1** | **The RN visual + e2e tiers gate nothing in CI** — iOS pixels need macOS, and all 15 workflows run `ubuntu-latest`. The web visual tier *does* run post-merge. | **OPEN, and cheaper than assumed: this repo is PUBLIC, so GitHub-hosted `macos-latest` runners are free.** The work is pinning Xcode + simulator runtime so goldens match, and installing `idb`/Maestro — not obtaining access. Alternatives: self-hosted Mac runner (one already does this work manually), cloud Mac providers, device farms, or rendering components through react-native-web for Linux pixel tests. Suggested first step: `macos-latest` on a nightly schedule, not per-PR. |
| T2 | A capture failure was indistinguishable from a visual regression — a failed deep link screenshotted the Expo launcher and reported a large diff. | **FIXED** (#350 + #353): the driver asserts readiness via the a11y tree and throws rather than returning an unverified screenshot. |
| T3 | `testID` only surfaces in the iOS a11y tree for nodes that are themselves accessibility elements — a plain container `View` never appears. Marking the wrapper `accessible` surfaces it but collapses the subtree (measured 41 nodes → 3). | **FIXED** (#353): the readiness marker is a 1×1 empty accessible sibling. Worth remembering for any future harness marker. |
| T4 | `expo start` rewrites `packages/client-react-native/tsconfig.json` and removes `expo-env.d.ts`; the rewritten formatting fails `biome ci`. Any worktree that captures goldens picks this up. | Recurring trap — reverted twice on 2026-07-25. Candidate fix: a `.gitattributes`/lint exclusion, or restore both after any Metro run. |
| T5 | The CI "Expo bundle smoke" still tolerates a react-native-worklets Babel-plugin crash whose root cause was fixed in #289. | Pre-existing; verify `expo export` is clean on CI x86, then remove the tolerance. |
| T6 | Phase 3's `shell` golden and Phase 4a's `rates` golden are still not pinned. | Pre-existing. Now cheap — the harness is trustworthy and captures reproduce at 0.01–0.05%. |

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

## 6. Deferred work with no plan yet

| Item | State |
|---|---|
| **Phase 5** (Credit / Equities / Analytics) | Designed (5a/5b/5c, parallel-buildable); **no plan files**. M6 gates sensible planning of 5c. |
| **Phase 6b-2** (`hologram`, `geo`, `layers`, `jarvis`, `topo`) | Scoped in the 6b plan's "Scope note"; not planned. All five share a `project3d` camera + precomputed world geometry. They are text-heavy, so **P1 blocks them meaningfully**. |
| **Phase 7** (cross-cutting polish + sign-off) | Untouched, last by definition. |
| `withAlpha()` helper / branded hex type | From #301 — colours are built by string-appending an alpha suffix; safe for today's accent tokens, silently invalid for any future `rgba()` one. |
| Credit filter alignment | RN uses a local 5-way filter; both the prototype and the domain are 3-way, and the shared `useCreditRfqFilterPreference()` seam is unused on RN. |
| Equities workspace alignment | RN holds selection in local `useState`; `useEqWorkspace()` is the shared singleton the web client uses for cross-panel sync. |
| RN visual harness | An inset 3D-card scenario is still wanted, to guard the `overflow:hidden` shadow-clip regression class the current full-bleed scenario cannot catch. |
