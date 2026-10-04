# Changelog

What landed on `main`, week by week, written for a person catching up — not a
commit dump. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
with two local adaptations:

- **Versions are ISO weeks** (`2026-W40` = Monday 28 Sep – Sunday 4 Oct). The
  repo publishes no package and cuts no release, so there is nothing for a
  semantic version to promise; a calendar week is the honest unit. A PR belongs
  to the week of its **merge time in UTC**.
- **Entries are grouped by theme, then by kind.** Each week opens with a short
  summary, then `Added` / `Changed` / `Fixed` for what a user of the app or a
  developer of the repo would notice, `Decisions` for the choices worth
  remembering (with the ADR, spec or doc that records the reasoning), and
  `Under the hood` for tests, gates, tooling, docs and dependency bumps.

Every merged PR is cited. The newest week is first. This file says
what **landed**; what is still **pending** lives in
[`docs/STATUS.md`](docs/STATUS.md), and the reasoning behind a decision lives in
the [ADRs](docs/adr/) and the linked specs. Add a week with `/rtc:changelog`.

## 2026-W40 — 28 Sep – 4 Oct

Preparing for a public audience. The deployed build became a hybrid (demo
accounts run in the browser, everyone else hits a hardened server), every
application core became a lazy chunk, the React Native client ran on a real
iPhone for the first time, and the docs were audited end to end.

### Added

- **Hybrid data source.** On a production build, credentials matching the demo
  roster are verified in the browser and run the simulators; any other login
  is posted to the server. [#879]
- **Demo-accounts hint on both web login screens** — click to fill, listing
  exactly the accounts the page verifies in the browser. [#896]
- **Equities price history** (`equityPriceHistory`, the 75th core member,
  native in all three cores), closing the prototype/data-model ledger. [#859]
- **Width-locked rail panels** in both layout engines. [#858]
- **Magnetic floating panels** — floats snap, attach into one window, move
  together and detach. [#888]
- **React Native:** haptics on all four ceremonies, a loop-gate census and a
  12-skin capture flag ([#901]); the login-wait treatments ([#892]); full bond
  names on RFQ chips and a shared equities selection ([#884]); a Credit spacing
  pass to the prototype ([#889]).

### Changed

- **Every application core is now a lazy chunk** ("approach B"): the RxJS
  composition root moved behind `@rtc/client-core/core`, so the eager bundle
  carries no core at all. [#883]
- **Server hardening B1**, in three PRs: wire bounds — payload caps, a socket
  error listener, per-connection ceilings, bounded stores ([#885]); edge guards
  — trusted IP, body cap, evicting rate limit, async scrypt, ban list,
  connection caps, token bucket ([#886]); an unprivileged container user, a Fly
  connection `hard_limit` and drift gates ([#887]).
- **Tooling is TypeScript.** Scripts, custom lint rules and tool configs are
  typed `.mts` run directly by Node; new JavaScript files are a lint error. [#905]
- **Vitest 4 → 5** (5.0.3), after the blocker was diagnosed as a
  concurrent-re-import mock regression. [#904] [#895]

### Fixed

- **The React Native app runs on a real iPhone** — eight native libraries
  pinned to the versions Expo Go bundles. [#907]
- **The effect-core e2e job was 1.65× slower than its siblings** because Vite
  dev served an 11 MB `effect` bundle on every page load; the e2e suites now
  get lean pre-bundled deps. [#906] (investigation opened in [#902])
- Re-added and reopened Dockview panels return to their root-row slot. [#860]
- The local container golden regen pins `--update-snapshots=all`, as CI does. [#876]
- `/rtc:gauntlet` flags CI drift from a known-steps table. [#862]
- The first-dock-render recorder moved off the reload edge (an e2e flake). [#845]

### Decisions

- **Hardening order and scope** — splash replay kept, the demo-account hint
  approved, B1 first; plus the five things only the owner can decide or do. [#882] [#890]
- **Where the three-core migration is meant to end** — the indirection goes
  too. [#881] Why three cores exist, and what transfers to a real project: [#875]
- **Keep barrel `effect` imports**; the dev-server cost is fixed at the
  bundling layer instead (recorded with [#906]).
- **Icebox:** splitting `CLAUDE.md` into a shared `AGENTS.md`. [#897]

### Under the hood

- **Docs audit, ten rounds** — stale facts and historical banners ([#865]), the
  architecture chapters catch up with 25 packages and three cores ([#871] [#868]),
  testing docs ([#866] [#872]), package READMEs ([#864]), and STATUS pruned and
  re-verified entry by entry ([#867] [#873] [#877] [#878]). New: §23 "Application
  Cores, Explained" ([#857]) and the 12-skin RN sweep ([#903]).
- **Tests:** a merged RN coverage report with a ≥95% line gate, fixing a
  denominator that read 63.9% ([#894]); the dock sash grip pinned by a strict
  low-threshold golden ([#891]); one screenshot-mask convention for all RN
  goldens ([#870] [#880]); `createWorld` takes a named seeds object ([#846]); the
  float-magnets journey's budget sized to its length ([#899]).
- **Agent workflow:** the `planning-uninterrupted-work` skill ([#869]) and a
  repo-level hook that keeps outward steps out of command chains ([#874]).
- **Dependencies:** three new `brace-expansion` advisories lifted ([#863]), one
  unfixable `braces` advisory suppressed with its reason ([#893]), and the
  weekly Renovate wave ([#847] [#848] [#849] [#850] [#851] [#852] [#853] [#854] [#855] [#856]).

## 2026-W39 — 21 Sep – 27 Sep

The pluggable-application-core workstream finished: the remaining slices
landed, delegation was deleted, and the core became a load-time choice.

### Added

- **Switch application core at load time** — `?core=` or Preferences; the two
  alternative cores ship as lazy chunks in one production build. [#844]
- **Equities, admin, shell, workspace and Jarvis members native in both
  alternative cores**, slice by slice: equities ([#809] [#810]), admin ([#814] [#817]
  [#818]), the shell five ([#819] [#820]), the workspace ([#821] [#822] [#823]), and the
  Jarvis family, reaching 74/74 ([#826] [#827] [#828]).
- **`@rtc/core-logic`** — the rules all three cores share that need no stream
  library, extracted from `client-core`. [#829]
- `dispose()` releases everything `createApp` holds, under a shared contract
  suite. [#834]

### Changed

- **Delegation removed; each alternative core stands alone** — no base app, no
  `CoreSeams`. The workstream closes. [#833]
- Cores reach connection events only through `AppPorts.connectionIntents`, and
  gate transport on their own `auth` ([#832]); `connectionEvents` and
  `connectionIntents` are paired structurally so a builder cannot supply one
  without the other ([#835]).
- Every internal reader of the base app follows the native members ([#812]);
  `createRunSlot` is the shared "one active run" guard in both cores ([#808]).

### Fixed

- **Order ticket, in all three cores:** a failing `place()` rejects the
  ticket, `reset()` replaces the form, and a fill is final. [#811]
- Failed data ports propagate, and Effect navigation lands in the same tick. [#824]
- A docked Jarvis panel keeps its float and its width ([#801]); the Phase 6b
  layout-preset residuals, including a diagnosed drag flake ([#802]).
- The visual runner hung forever under `pnpm exec`; the host Vite is launched
  directly. [#841]
- The e2e suites honour the chosen core. [#837]

### Decisions

- **Public-launch hardening as two tracks** — the design and its STATUS entry. [#843]
- **Vitest 5 parked**, with findings, traps and unblock options ([#839]);
  reanimated 4.7's jest resolver is not a drop-in under pnpm ([#838]).
- **Timer-driven waits run on fake timers** — the rule, written into the test
  strategy after a CI flake went red three times. [#830]

### Under the hood

- **Tooling:** worktree readiness is loud and the mutation check is scripted
  ([#815]); `check:scripts` asserts each package's depcruise path pair and RN
  jest mapping ([#831]).
- **Tests:** both clients' dock fixture routes through the real
  `createWorkspaceDock` ([#836]); `rfqCountdown` seeded by object and the
  port-tally harness hoisted into `core-contract` ([#813]).
- **Docs:** the root README refreshed with live demos, screenshots and a
  feature tour ([#840]), and reframed as a software-factory experiment ([#842]);
  slice plans and rulings ([#807] [#816]); the Jarvis driver's misreported refused
  dock recorded ([#825]).
- **Dependencies:** the weekly wave ([#803] [#804] [#805] [#806]).

## 2026-W38 — 14 Sep – 20 Sep

The busiest week of the five (68 PRs). Dockview became the default layout
engine and gained floating groups, chart instances and saved layouts; the
pluggable core went from slice 1 to slice 3; CI gained a security tier; and
test fixtures got a house style enforced by lint.

### Added

- **Dockview floating groups** (Phase 6a) — float a panel, move it by its own
  head, drag it back into the grid with Shift, and get its pre-float size back
  on re-dock. [#763] [#770] [#776] [#783]
- **Dockview chart instances** (Phase 4) — pinned multi-instance equities
  charts. [#738]
- **Layout presets** (Phase 6b) — per-tab saved layouts. [#798]
- **Pluggable core, slices 1a–3:** connection, theme, skin, view-mode,
  power-saver and reconnect ([#764]); the eleven remaining preference presenters
  ([#765] [#772]); FX pricing and blotter, with Effect Tag/Layer composition ([#793]
  [#794]); credit ([#797] [#800]).
- **CI security tier** — Dependency Review, zizmor and OpenSSF Scorecard
  ([#775]), with the first Scorecard run acted on ([#777]) and every ad-hoc
  installer pinned, closing 30 advisories the Vercel lockfile exposed ([#782]).
- **`check-dist`** — a truncated `dist` now fails the build that produced it. [#795]
- Jarvis refuses layout operations on floating or popped-out panels, and says
  why. [#784]

### Changed

- **The default layout engine is Dockview** (breaking for a fresh visitor; a
  stored "inhouse" choice is kept). [#755]
- **CI fails on Biome warnings**, after all 22 were cleared. [#780]
- **Test fixtures have a house style:** JSON payloads are object literals, not
  minified strings ([#747] [#750]); factories are named `create*` (~230 renames,
  [#757] [#761] [#758]); `newspaper-order` moves fixtures below the tests, in every
  package ([#749] [#753] [#756] [#759]); page objects own their component and their
  engine ([#754] [#773]).
- The pluggable core's nineteen open residuals were closed — the cores now
  converge on error reset, seedless folds and port discipline. [#785]

### Fixed

- **Dockview:** a float pops out and moves by its own head ([#776] [#778]);
  dispose persists only a layout a user arranged ([#737]); a pristine grid lands
  a settle resize exactly ([#739]); design pins are suspended when nothing is
  left to absorb, and a released pin reaches Dockview's branch cache ([#745]
  [#768]); the `data-maximized` witness is back on both bridges ([#741]); a
  dragged Jarvis panel keeps its position across a reload ([#799]).
- **Jarvis preferences** name the brain that is actually running. [#786] [#791]
- Solid's float/close head slots leaked a computation per click. [#792]
- A private member is never a "slot" — a hole in the handler-naming rule. [#744]
- **Flakes:** chart geometry read when laid out, not on one sample ([#743]); the
  visual tier captures the settled frame, not Dockview's resize flash ([#751]);
  `idleReconnect` pinned so the idle window costs one timer, not 15,800 ([#762]).

### Decisions

- **[ADR-007](docs/adr/ADR-007-ci-security-tooling.md) — CI security tooling**, later corrected with the
  measured Scorecard re-score. [#775] [#779]
- **The 39 execution rulings of Phase 6a** (floating groups). [#767]
- **Raw `api.groups` reads are banned** — name the question instead, since
  floating and popped-out groups stay listed. [#781]
- **RN 0.87 cannot land yet**, and why. [#746]

### Under the hood

- **Tests:** property tests for `motion-core` ([#787]); every App visual
  scenario names its layout engine ([#752]); a floating-panel golden, and two
  maximize goldens re-pinned ([#771] [#769]).
- **Plans and specs:** Phase 6 design and 6a plan ([#740] [#742]); pluggable-core
  slice plans ([#760] [#766] [#774] [#790] [#796]).
- **Deploy:** the Vercel CLI unpinned to 59.23.1, proven by a dispatch. [#789]
- **Docs:** the Jarvis forced-gate check done, and its recipe replaced. [#788]
- **Chores and dependencies:** Claude allowlist entries ([#736] [#748]), GitHub
  Actions majors ([#733] [#734]), `@types/jest` 30 ([#735]).

## 2026-W37 — 7 Sep – 13 Sep

Three foundations in one week: the pluggable application core (slice 0),
TypeScript 7, and the first Dockview-native features.

### Added

- **Pluggable application core, slice 0** — `@rtc/core-api`, the
  `core-contract` equivalence tier, async and Effect cores at 100% delegation,
  selected by `VITE_CORE_IMPL`. [#717]
- **Dockview-native features:** drag-and-drop rearrangement (Phase 1, [#707]),
  stacked-tab chrome (Phase 2, [#715]), panel close/reopen with a View menu in
  the app head (Phase 3, [#718]), and pop-out OS windows (Phase 5, [#727]).
- **Jarvis panels dock into the Dockview engine.** [#724]
- Solid bindings: pure-subscription hooks accept accessors, so seam snapshots
  go live. [#714]

### Changed

- **TypeScript 7** (the Go-native `tsc`) through a dual install; `typescript`
  stays the 6.x API for the tools that need one. Whole-repo typecheck went
  from 21.9 s to 4.7 s. [#719]
- **Major dependency moves:** Dockview 7 → 8.3.1 ([#723]), pnpm 11 → 12 ([#726]),
  motion 13, jsdom 30 and jest-dom 7 ([#722]).
- **Solid reactivity directives retired** — 59 `solid/reactivity` disables
  replaced by `on()`, `createMemo` and explicit `untrack`. [#705] [#709]

### Fixed

- RN layout specs moved out of expo-router's route tree, with a gate keeping
  `app/` routes-only. [#700]
- The CI Playwright container matches the npm version, and a gate now checks
  the image tag against the lockfile. [#701]
- Advisories: `qs` ([#699]), `js-yaml` and `hono` ([#704]).

### Decisions

- **The pluggable-core spec** — RxJS, async/await and Effect-TS cores behind
  one contract ([#706]), and its slice split ([#713]). See
  [ADR-006](docs/adr/ADR-006-pluggable-application-core.md).
- **The Dockview-native features spec** — the disparity doctrine and six
  phases. [#702] Phase 4's plan is precondition-gated. [#720]
- **The default-engine flip was tried and reverted the same day** ([#725], then
  [#731]) to return `main` to green; it landed for good the following week.
- **GenUI × Dockview spec** ([#712]) and the A2UI research note ([#703]).

### Under the hood

- **Visual tier:** the RFQ countdown capture race retired ([#710] [#716]);
  Playwright never adopts a foreign Vite server ([#711]).
- **Lint:** `class-filename-match` scoped to production source. [#708]
- **Dependencies:** the Monday wave applied by hand ([#721]), plus Renovate
  ([#689] [#690] [#691] [#692] [#693] [#694] [#695] [#696] [#697] [#698]).

## 2026-W36 — 31 Aug – 6 Sep

Two fidelity pushes — the Dockview engine reaching parity with the in-house
one, and round 3 of React Native against the design — plus a code-quality
audit that turned into seven plans and several new lint rules.

### Added

- **Dockview maximize** as the in-house strip policy — scoped, siblings become
  strips, exact restore. [#648]
- **Engine parity as a number:** every layout state is shot under both
  engines, and `visual:engine-parity` reports the difference. [#649]
- **`rtc/name-jsx-handlers`** — inline JSX callbacks banned; 257 sites
  migrated across React, Solid and React Native. [#662] [#665] [#666]
- **`rtc/no-framework-calls-in-specs`** — specs speak page objects, rolled out
  package by package from a 1,651-warning ledger to an error everywhere. [#674]
  [#677] [#680] [#683] [#685] [#686] [#687] [#688]
- **React Native:** a LoginScreen as LockScreen's sibling ([#646]); the radial
  dock at the design's true-bottom geometry ([#642]); tinted SELL/BUY pads
  ([#641]); a candle-body morph on symbol switch ([#661]); gradient CTAs ([#668]).
- The mobile design's 8-stock equities roster and a real bond catalogue. [#681] [#682]

### Changed

- **Dockview's gap-0 model** — the gutter is a CSS inset and models are
  integers end to end, which retires the half-pixel class of bugs. [#676]
- Dockview rails hold their design width through viewport resizes. [#656]
- Vertical collapse strips narrowed to the 32px bar, with a sideways head
  gradient on the 3D skins. [#659]
- **RN fidelity round 3:** tile gradients ([#657]), the ambient aurora ([#672]),
  every separator at the design's 1pt ([#678]), dock and pulse timings ([#658]),
  sheet and inset corrections ([#663]).
- The inline-style ban now covers React Native and the extension. [#660]

### Fixed

- **Dockview:** expanding after a reload restores the true pre-collapse size
  ([#670]), and sequential expands restore exact sizes ([#673]).
- **RN type rendering:** real 600/700 cuts instead of faux bold ([#630]), the
  mono fallback keeps the platform family ([#644]), the exposure bubble rounds
  to a whole pixel ([#645]).
- Advisories: `decode-uri-component` ([#655]), `fast-uri` ([#669]).

### Decisions

- **Seven plans from the code-quality gate-scope audit.** [#650]
- **Why the RN package runs a jest island** ([#651]), and **RN styling
  doctrine** — `StyleSheet.create` is the `module.css` analogue ([#653]).
- **Devtools state-layer doctrine**, with grep gates 38–40. [#654]
- **Solid `solid/reactivity` disable doctrine** — all 41 setup-scope disables
  triaged and the rule written down. [#671]

### Under the hood

- **Visual goldens:** resting Dockview goldens re-pinned after [#656] ([#664]); a
  scoped pixel budget for two strip twins ([#667]), later retired by [#676].
- **Docs:** the RN fidelity showcase as a three-way comparison, and its
  close-outs. [#647] [#652] [#675] [#679] [#684]
- **Tests:** devtools-app scans script blocks by index. [#643]
- **Dependencies:** the weekly Renovate wave ([#631] [#632] [#633] [#634] [#635] [#636]
  [#637] [#638] [#639] [#640]).

<!-- PR links: one definition per cited PR, ascending. -->

[#630]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/630
[#631]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/631
[#632]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/632
[#633]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/633
[#634]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/634
[#635]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/635
[#636]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/636
[#637]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/637
[#638]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/638
[#639]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/639
[#640]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/640
[#641]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/641
[#642]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/642
[#643]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/643
[#644]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/644
[#645]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/645
[#646]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/646
[#647]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/647
[#648]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/648
[#649]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/649
[#650]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/650
[#651]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/651
[#652]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/652
[#653]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/653
[#654]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/654
[#655]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/655
[#656]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/656
[#657]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/657
[#658]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/658
[#659]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/659
[#660]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/660
[#661]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/661
[#662]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/662
[#663]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/663
[#664]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/664
[#665]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/665
[#666]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/666
[#667]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/667
[#668]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/668
[#669]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/669
[#670]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/670
[#671]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/671
[#672]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/672
[#673]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/673
[#674]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/674
[#675]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/675
[#676]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/676
[#677]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/677
[#678]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/678
[#679]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/679
[#680]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/680
[#681]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/681
[#682]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/682
[#683]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/683
[#684]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/684
[#685]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/685
[#686]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/686
[#687]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/687
[#688]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/688
[#689]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/689
[#690]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/690
[#691]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/691
[#692]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/692
[#693]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/693
[#694]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/694
[#695]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/695
[#696]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/696
[#697]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/697
[#698]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/698
[#699]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/699
[#700]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/700
[#701]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/701
[#702]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/702
[#703]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/703
[#704]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/704
[#705]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/705
[#706]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/706
[#707]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/707
[#708]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/708
[#709]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/709
[#710]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/710
[#711]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/711
[#712]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/712
[#713]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/713
[#714]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/714
[#715]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/715
[#716]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/716
[#717]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/717
[#718]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/718
[#719]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/719
[#720]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/720
[#721]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/721
[#722]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/722
[#723]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/723
[#724]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/724
[#725]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/725
[#726]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/726
[#727]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/727
[#731]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/731
[#733]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/733
[#734]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/734
[#735]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/735
[#736]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/736
[#737]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/737
[#738]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/738
[#739]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/739
[#740]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/740
[#741]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/741
[#742]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/742
[#743]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/743
[#744]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/744
[#745]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/745
[#746]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/746
[#747]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/747
[#748]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/748
[#749]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/749
[#750]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/750
[#751]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/751
[#752]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/752
[#753]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/753
[#754]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/754
[#755]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/755
[#756]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/756
[#757]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/757
[#758]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/758
[#759]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/759
[#760]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/760
[#761]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/761
[#762]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/762
[#763]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/763
[#764]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/764
[#765]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/765
[#766]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/766
[#767]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/767
[#768]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/768
[#769]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/769
[#770]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/770
[#771]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/771
[#772]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/772
[#773]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/773
[#774]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/774
[#775]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/775
[#776]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/776
[#777]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/777
[#778]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/778
[#779]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/779
[#780]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/780
[#781]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/781
[#782]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/782
[#783]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/783
[#784]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/784
[#785]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/785
[#786]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/786
[#787]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/787
[#788]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/788
[#789]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/789
[#790]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/790
[#791]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/791
[#792]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/792
[#793]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/793
[#794]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/794
[#795]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/795
[#796]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/796
[#797]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/797
[#798]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/798
[#799]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/799
[#800]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/800
[#801]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/801
[#802]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/802
[#803]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/803
[#804]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/804
[#805]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/805
[#806]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/806
[#807]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/807
[#808]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/808
[#809]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/809
[#810]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/810
[#811]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/811
[#812]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/812
[#813]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/813
[#814]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/814
[#815]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/815
[#816]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/816
[#817]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/817
[#818]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/818
[#819]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/819
[#820]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/820
[#821]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/821
[#822]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/822
[#823]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/823
[#824]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/824
[#825]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/825
[#826]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/826
[#827]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/827
[#828]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/828
[#829]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/829
[#830]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/830
[#831]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/831
[#832]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/832
[#833]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/833
[#834]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/834
[#835]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/835
[#836]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/836
[#837]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/837
[#838]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/838
[#839]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/839
[#840]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/840
[#841]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/841
[#842]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/842
[#843]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/843
[#844]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/844
[#845]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/845
[#846]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/846
[#847]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/847
[#848]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/848
[#849]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/849
[#850]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/850
[#851]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/851
[#852]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/852
[#853]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/853
[#854]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/854
[#855]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/855
[#856]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/856
[#857]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/857
[#858]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/858
[#859]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/859
[#860]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/860
[#862]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/862
[#863]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/863
[#864]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/864
[#865]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/865
[#866]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/866
[#867]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/867
[#868]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/868
[#869]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/869
[#870]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/870
[#871]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/871
[#872]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/872
[#873]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/873
[#874]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/874
[#875]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/875
[#876]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/876
[#877]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/877
[#878]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/878
[#879]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/879
[#880]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/880
[#881]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/881
[#882]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/882
[#883]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/883
[#884]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/884
[#885]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/885
[#886]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/886
[#887]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/887
[#888]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/888
[#889]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/889
[#890]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/890
[#891]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/891
[#892]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/892
[#893]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/893
[#894]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/894
[#895]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/895
[#896]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/896
[#897]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/897
[#899]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/899
[#901]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/901
[#902]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/902
[#903]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/903
[#904]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/904
[#905]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/905
[#906]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/906
[#907]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/907
