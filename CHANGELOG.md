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
the [ADRs](docs/adr/) and the linked specs.

Each finished week is also a **git tag** of the same name, on the last commit
that reached `main` before Monday 00:00 UTC — so `git diff 2026-W39 2026-W40`
is exactly the change the W40 section describes. The `Weekly tag` workflow
creates the tag and opens a reminder issue; `/rtc:changelog` writes the entry.

## 2026-W41 — 5 Oct – 11 Oct

The application core became hot-swappable: picking a core in Preferences swaps
it in place, with no reload, and the session, socket, blotter and layout carry
over. Around it, the two web clients' duplicated boot code collapsed into one
package, the Effect core closed its last measured gaps, the e2e suites moved
onto a production build, and the React Native visual tiers gained Android.

### Added

- **Hot swap of the application core.** Choosing a core in Preferences
  composes the new one over the same ports and reopens Preferences on it
  ([#964]); a branded overlay covers the handover — 160 ms in, a 500 ms hold,
  200 ms out, jump cuts under reduced motion or Freeze, the app tree `inert`
  while covered ([#967]). Built on two prerequisites: any core can be
  recomposed over ports another composition used, pinned by a new contract
  suite on all three cores ([#953]), and `DevtoolsHub.endComposition()`, so an
  attached inspector follows the new core ([#952]). Spec and plan: [#949].
- **React Native:** `dev:android` in the same five modes as `dev:ios` ([#954]);
  the ambient background is now the web's aurora and rays ([#976]); demo
  accounts listed on the sign-in screen in simulator mode ([#977]).

### Changed

- **One copy of the web clients' boot code**, in a new package
  `@rtc/web-boot`: the 29 files the clients kept identical by hand ([#987]),
  then the port builder and the devtools hub ([#992]), then `startWebClient`,
  one composition root for both clients — each `main.tsx` is now its fonts,
  its view and one call ([#994]).
- **`dispose()` cuts every port stream, whoever still holds it**, on all three
  cores; RxJS and async had left 16 and 12 port subscriptions open. [#982]
- **The Effect core, after profiling:** state lives in a `SyncRef`, not a
  `SubscriptionRef`, so no fiber runs per subscriber (grep gate 50) ([#950]); a
  replay arrives with the subscribe, the roster's prices share one queue and
  intents are a filtered view ([#955]); no member joins streams with an Effect
  combinator, and grep gate 51 enforces it ([#961]).
- **The Playwright e2e suites drive a production build** (`vite preview`), not
  the dev server — the React suite went from 310 s to 197 s locally ([#957]).
  Read like for like in CI, the Effect job's gap closed from 1.17× to
  1.06× ([#971]).
- **The Jarvis vocabulary the contract names moves to `@rtc/domain`**, so
  `@rtc/core-api` depends on the domain alone and no UI-side package lists
  `@rtc/shared` ([#945]); `AdminJarvisUsagePayload` is renamed
  `JarvisUsage` ([#946]).
- **Lint:** one import statement per module, types inline
  (`rtc/one-import-per-module`, autofixed across 376 files) ([#948]); a lint
  warning now fails the build ([#960]), so the warnings-ledger CI step goes
  dormant and the ledger stays as a fallback ([#963] [#973]).

### Fixed

- **Simulator prices tick at their designed cadence.** Each subscription
  started its own price walk over shared state, so with a tile's price and
  sparkline both subscribed every symbol moved twice per interval — and the
  Jarvis narrator spoke about ten seconds into every session ([#959]). Six
  more simulator streams had the same shape: equity quotes, analytics,
  topology and the three admin metrics ([#970]).
- **`dispose()` saves a layout change** still inside the 500 ms persistence
  debounce; all three cores had dropped it. [#953]
- **Hot-swap follow-ups:** the React boot splash stayed mounted under a stored
  Freeze, the login screen flashed on every composition, a page booted offline
  showed CONNECTED, Preferences lost focus after a swap, and the Effect core
  subscribed the theme port twice ([#975]); Solid's splash under a mid-fade
  Freeze, and live mode stuck on CONNECTING after coming back online
  ([#979]); live mode stuck after an idle close plus an offline spell
  ([#983]); a `dispose()` that never settles ends the swap on the boot-error
  screen after 5 s, not a blank page ([#981]).
- **The web clients deploy again:** `vercel build` rejects `engines.node:
  ">=26"`, so the Node floor moves to `devEngines.runtime`, held there by grep
  gate 52. [#974]

### Decisions

- **A hot swap never falls back silently** — the ports outlive a core; a
  failed chunk load leaves the old core running, a failed composition
  recomposes the previous one. [#949]
- **A hung `dispose()` times out into the fatal screen**: the next core is
  never composed over ports a half-disposed core may still hold. [#981]
- **`dispose()` cuts streams a consumer still holds**, on every core. [#982]
- **The Effect core's last two start-up costs are accepted** — evaluating its
  chunk and building the Layer graph, which one combined Layer would halve at
  the cost of one service per presenter; recorded in ADR-006 ([#955]).
  `SyncRef` is the one primitive the core writes for itself where `effect`
  ships one (ADR-006, "State in a `SyncRef`") ([#950]).
- **The Gherkin suites and full-stack smokes stay on the dev server**, so a
  browser still witnesses what a build lacks (StrictMode double mounts,
  dev-only branches). [#957]
- **The RN ambient background follows the web**, reversing the
  prototype-fidelity round's switch to the mobile prototype's washes
  (`docs/rn-open-items.md`); Rays is drawn at one level in every skin, the
  owner's choice. [#976]
- **Parked:** a language-neutral core contract — JSON scenarios every core
  replays — as step 1 of a React Native → native experiment. [#958]

### Under the hood

- **RN visual tiers:** the Maestro tier reaches all 26 goldens on iOS and the
  two iOS tiers are measured side by side, whether to keep both left open
  ([#951]); an Android leg on a Pixel 10a emulator ([#966]), verified headless
  at 156/156 once a covered emulator window was found throttled by macOS, with
  a runner that survives a failed flow ([#978]); a capture no longer boots the
  real app ([#984]); `visual-ready` waits for the scene to stop committing
  ([#986]); the runners refuse a device already in use and recognise the
  post-Maestro simulator ([#995]). Showcase: iOS beside Android, 26 golden
  pairs ([#980] [#988]), and the skin sweep re-shot ([#990]).
- **Tests:** the swap overlay's style checks gate PRs, the pop-out swap is an
  e2e journey, and the local macOS goldens are regenerated. [#972]
- **Docs and STATUS:** the blocked Android work and the RN distribution
  leftovers ([#947]); sharing the published demo, and why its update URL is
  not a secret ([#965]); Biome's line width 80 → 100, measured and left
  optional ([#962]); `ubuntu-latest` becoming Ubuntu 26 on 19 Oct ([#989]);
  simctl's fixed 1.5 s post-ready wait may no longer be needed ([#993]).
- **Agent workflow:** a push that deletes or sweeps, and an `--admin` merge,
  now ask first; two broader rules were tried and reverted. [#991]
- **Dependencies:** advisories cleared by override — `brace-expansion` 2.x,
  `fast-uri` and `ip-address` ([#956]); `seroval`, `proxy-addr` and
  `source-map-js`, and then the MCP SDK and `shell-quote`, each after the
  production audit went red on every branch ([#968] [#985]); and the weekly
  Renovate wave ([#937] [#938] [#941]).

## 2026-W40 — 28 Sep – 4 Oct

Preparing for a public audience. The deployed build became a hybrid (demo
accounts run in the browser, everyone else hits a hardened server), every
application core became a lazy chunk, and on the last evening the RxJS core
moved into a package of its own beside the other two. The Effect core was
profiled down to render parity, the React Native client ran on a real iPhone
and was published to Expo Go, and the docs were audited end to end.

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
- **React Native away from the Mac.** A demo build is published to Expo Go with
  EAS Update, so the app opens on a phone with no Metro running ([#908], its
  publish script fixed in [#916], the README corrected in [#919]); a published
  build shows its commit and publish time in the status strip and on the
  sign-in screen ([#918]). An `.easignore` and a post-install hook let an EAS
  cloud build start ([#925]), and an Android preview build completed on Expo's
  servers ([#930] [#931]); `preview:android:build` / `preview:android:run`
  start an emulator and install the latest build, and the scripts follow
  `<purpose>:<platform>:<variant>` (`demo:publish:ios` became
  `demo:ios:publish`) ([#935]).
- **`CHANGELOG.md`**, backfilled for W36–W40, with `/rtc:changelog` to keep it
  current ([#910]), and a weekly workflow that tags each finished ISO week and
  opens a reminder issue ([#913]).

### Changed

- **Every application core is now a lazy chunk:** the RxJS composition root
  moved behind `@rtc/client-core/core`, so the eager bundle carries no core at
  all ([#883]); then every presenter and machine followed, leaving the root
  index as the edge — adapters, port factories, stores, pure helpers ([#900]).
- **The RxJS core in its own package**, in four PRs after a spec ([#915]): every
  consumer imports each name from the package that defines it, with the
  pass-through re-exports removed ([#921]); the pure view helpers move to
  `@rtc/core-logic` ([#926]); `@rtc/client-core-rxjs` is extracted as a sibling
  of the async and Effect cores, the `/core` subpath gone and one set of
  dependency rules covering all three ([#929]); and what remained is renamed
  `@rtc/client-adapters` ([#932]). No runtime change.
- **Server hardening B1**, in three PRs: wire bounds — payload caps, a socket
  error listener, per-connection ceilings, bounded stores ([#885]); edge guards
  — trusted IP, body cap, evicting rate limit, async scrypt, ban list,
  connection caps, token bucket ([#886]); an unprivileged container user, a Fly
  connection `hard_limit` and drift gates ([#887]).
- **Tooling is TypeScript.** Scripts, custom lint rules and tool configs are
  typed `.mts` run directly by Node; new JavaScript files are a lint error
  ([#905]). The React Native configs followed, and CommonJS files and globals
  are now banned too ([#911] [#917]); every tsc-built `dist` is Node-resolvable,
  so tests and RN scripts run without `tsx` ([#927]).
- **Vitest 4 → 5** (5.0.3), after the blocker was diagnosed as a
  concurrent-re-import mock regression. [#904] [#895]

### Fixed

- **The React Native app runs on a real iPhone** — eight native libraries
  pinned to the versions Expo Go bundles. [#907]
- **The effect-core e2e job was 1.65× slower than its siblings** because Vite
  dev served an 11 MB `effect` bundle on every page load; the e2e suites now
  get lean pre-bundled deps. [#906] (investigation opened in [#902])
- **The Effect core rendered far more than the other two.** Profiling found a
  50-tick start-up replay delivered one value per turn ([#909]), so the FX
  tiles rendered 1,070 times at start-up instead of ~95. A same-turn burst now
  arrives in one turn ([#912]); a turn scheduler settles the core's fibers in
  one microtask and ports are released synchronously on close ([#920]); folds
  hand state to subscribers directly and two ports merge in one queue
  ([#922]). New "…in one turn" contract cases hold all three cores to it. What
  start-up still costs, and why the e2e job's remaining gap is a per-page-load
  dev-server cost: [#928].
- Re-added and reopened Dockview panels return to their root-row slot. [#860]
- RN Maestro flows stop the app first — every other flow crashed it on reload —
  and a missing golden reads `NO GOLDEN`, not `FAIL 100%`. [#936]
- Gate 1 skips `tests/reports`, where vitest 5's report bundle tripped it on
  every second local run. [#914]
- The local container golden regen pins `--update-snapshots=all`, as CI does. [#876]
- `/rtc:gauntlet` flags CI drift from a known-steps table. [#862]
- The first-dock-render recorder moved off the reload edge (an e2e flake). [#845]

### Decisions

- **Hardening order and scope** — splash replay kept, the demo-account hint
  approved, B1 first; plus the five things only the owner can decide or do. [#882] [#890]
- **Where the three-core migration is meant to end** — the indirection goes
  too. [#881] Why three cores exist, and what transfers to a real project: [#875]
- **The RxJS core leaves `@rtc/client-core`** — for the boundary and the
  symmetry of the three cores, not for speed: the default visitor downloads
  slightly more ([#900]); its own package and the `client-adapters` rename were
  designed as ADR-006 Follow-up 10 ([#915]).
- **Keep barrel `effect` imports**; the dev-server cost is fixed at the
  bundling layer instead (recorded with [#906]).
- **EAS Update switched on** for the RN demo, reversing the earlier choice to
  keep updates off. [#908]
- **The changelog entry is written, not generated** — grouping and decisions
  need judgement, so the weekly workflow only tags and reminds. [#913]
- **Three performance rules stay** although Chromium 153 no longer reproduces
  them in the simplest case (`background-color`, SVG-child transforms, `var()`
  in a transform). [#933]
- **Icebox:** splitting `CLAUDE.md` into a shared `AGENTS.md`. [#897]

### Under the hood

- **Docs audit, ten rounds** — stale facts and historical banners ([#865]), the
  architecture chapters catch up with 25 packages and three cores ([#871] [#868]),
  testing docs ([#866] [#872]), package READMEs ([#864]), and STATUS pruned and
  re-verified entry by entry ([#867] [#873] [#877] [#878]). New: §23 "Application
  Cores, Explained" ([#857]) and the 12-skin RN sweep ([#903]).
- **STATUS:** the tooling migration's three open items ([#923]), and adopting
  the extracted `rx-ws-effects` package plus the skills-plugin follow-ups
  ([#924]).
- **Tests:** a merged RN coverage report with a ≥95% line gate, fixing a
  denominator that read 63.9% ([#894]); the dock sash grip pinned by a strict
  low-threshold golden ([#891]); one screenshot-mask convention for all RN
  goldens ([#870] [#880]); `createWorld` takes a named seeds object ([#846]); the
  float-magnets journey's budget sized to its length ([#899]).
- **Agent workflow:** the `planning-uninterrupted-work` skill ([#869]) and a
  repo-level hook that keeps outward steps out of command chains ([#874]).
- **Dependencies:** three new `brace-expansion` advisories lifted ([#863]), one
  unfixable `braces` advisory suppressed and recorded as the one audit
  exception ([#893] [#934]), and the weekly Renovate wave ([#847] [#848] [#849]
  [#850] [#851] [#852] [#853] [#854] [#855] [#856]).

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

A heavy week (68 PRs). Dockview became the default layout
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

## 2026-W35 — 24 Aug – 30 Aug

Three pushes, nearly all of it landing over one weekend. The Dockview engine
took on the in-house engine's panel design and motion; the React Native client
went screen by screen against the mobile-v1 prototype, from an honest
comparison to all 21 surfaces rated close; and the devtools inspector got
Redux-style store-first navigation plus a three-phase follow-ups sweep.

### Added

- **Dockview wears the in-house panel chrome** on both clients: the panel's
  38px head is dockview's tab bar, with card insets, 7px gutters, collapse and
  maximize controls and the 360px design rail, all built from header pieces
  now shared with the in-house engine. [#587]
- **Dockview glides** collapse, expand, maximize and restore over the in-house
  engine's 0.34s curve, while sash drags and resizes stay instant ([#602]); a
  fully collapsed rail column becomes stacked vertical strips, as in-house
  ([#629]).
- **Store-first navigation in the devtools inspector** — one tree (All /
  Presenters / Machines / Wire) replaces the filter rail and the Machines and
  Wire lenses. Selecting a node scopes the actions list, the State pane and a
  new Machine tab; **Clear** / **Unclear** hide everything before a watermark
  without touching the store. The spec ([#596]), the plan ([#598]) and the
  build ([#600]).

### Changed

- **React Native, screen by screen to the mobile-v1 prototype:** the equities
  blotter as stacked order and position cards ([#595]); the trade view as the
  design's card stack with a chip-and-stepper ticket ([#597]); Markets
  ([#610]); the credit RFQ tiles ([#611]); analytics number formats and bubble
  sizes ([#612] [#619]); the Appearance sheet ([#613]); the LockScreen
  ([#608]); the boot chrome as the design's bottom block ([#624]); the open
  radial dock, the new-RFQ form and the spot trade ticket ([#622] [#625]
  [#626]).
- **React Native, across every screen:** a boxed segmented sub-nav ([#599]); no
  connection banner while connected ([#601]); the HUD grid shows through every
  module root and cards take the design's 12px tile surface ([#603]); real
  600/700 font cuts instead of iOS faux bold ([#606]); the Orbitron wordmark and
  the remaining face and case misses ([#623]).

### Fixed

- **Dockview panel bodies under every skin.** The 3D skins' gradient tokens
  were invalid through dockview's `background-color`, so cards painted nothing
  and the backdrop showed through; the React bridge's passive effect left the
  first frame blank, which produced two blank x86 goldens and a red
  post-merge `visual.yml`. [#594]
- **Dockview:** the Admin tab threw and rendered nothing, because its single
  panel made a leaf-rooted grid dockview rejects ([#590]); the React bridge
  rebuilt dockview on every layout change, and the saved layout drifted a few
  pixels per reload ([#587]).
- **The React DevTools extension froze the inspector tab** under live traffic
  by serialising its props on every commit; it is now disabled on the
  inspector page, with `?react-devtools` to opt back in. [#620]
- **React Native:** the ambient background ignored Freeze ([#588]), and the
  trade-ticket sheet animated under reduced motion ([#626]).
- Two devtools-app tests that failed only on the shared CI runner. [#615]

### Decisions

- **Dockview residuals** — maximize stays dockview-native and Jarvis-docked
  panels stay in-house only, recorded in
  [ADR-002](docs/adr/ADR-002-layout-management-port.md). [#587]
- **Before-golden first:** every RN fidelity change starts from a golden of
  the target's real composition already on `main`, so the diff shows before
  and after ([#593]); restyles are accepted by eyeballing a before / after /
  prototype strip, not merged on green ([#597] [#599]).
- **Web-only extras the mobile prototype never drew are removed, not
  restyled** — the desk P&L gauge and sparkline, the depth ladder, the sector
  heat map, each for that reason. [#595] [#597] [#610]
- **The React DevTools guard is an inline script**, because Biome's import
  sorting leaves no way to run a guard ahead of `react` without a lint
  disable, which the repo bans. [#620]

### Under the hood

- **RN visual harness made honest:** every module golden framed in the real
  HUD chrome ([#588]), the boot goldens in the real `BootSequence` ([#591]),
  `lock/hold` in the real `LockScreen` ([#607]); a report-only visual-reach
  instrument that lists the files no golden renders ([#593]); the credit fake
  seeds the real dealer desks ([#617]). The harness had captured first-commit
  text in the system font, so it now mounts scenarios only once fonts load and
  all 21 goldens were re-pinned ([#623]).
- **Zero-pixel RN refactors**, each proven against the committed goldens: the
  duplicate `border` token folded into `borderSubtle` ([#605]), one
  `SegmentedPill` primitive ([#618]), a `labelStyle` helper over 55 sites
  ([#628]), and a file renamed after its last export ([#616]).
- **Devtools follow-ups sweep:** mechanical fixes, a coverage backfill and
  ≥95% CI gates for both devtools packages, which also join the coverage report
  as two tiers ([#604]); then structural fixes — the context pane split, an
  `Evicted (n)` tree leaf, a frame cap on `LiveHistory`, an exact mount seed
  ([#609]).
- **Docs:** the
  [RN prototype-fidelity comparison](docs/showcase/rn-prototype-fidelity-comparison.html)
  showcase ([#589]), refreshed as the work landed ([#614] [#621]) and closed
  with a residuals entry in STATUS at 21 close, 0 moderate, 0 far ([#627]).
- **Visual goldens:** the Mac-local `react-local` set regenerated after two
  weeks of drift. [#592]
- **Dependencies:** [#584] [#585].

## 2026-W34 — 17 Aug – 23 Aug

A maintenance week. Most of it was dependency upkeep — two bumps that could
not pass on their own were unblocked at the root, and Renovate moved from a
continuous drip to one grouped Monday wave — plus two test fixes.

### Changed

- **Renovate opens one weekly wave** (before 06:00 on Monday) instead of a
  continuous drip, and groups the coupled ecosystems: `react-native` with
  `@react-native/**`, the React Native community libraries, type definitions,
  and lint tooling. [#582]

### Fixed

- **Solid's equities chart painted its price labels under the plot**, not over
  it as React does; a canvas line crossing a label showed through its edge. [#567]
- A Dockview unit test slept a fixed 5ms waiting for a saved size and lost the
  race on a loaded runner; it now polls for the value it asserts. [#565]

### Decisions

- **Let the Expo SDK drive `react-native`.** Grouping the RN core makes a
  version-skewed RN/jest-preset PR impossible rather than red on every
  release; risk-bearing production dependencies stay ungrouped, per package.
  [#582]

### Under the hood

- **Tests:** `Scenario.strict`, an opt-in zero-tolerance pixel budget, applied
  to `equities/chart-canvas` after it measured zero run-to-run noise. [#567]
- **Two bumps unblocked at the root:** `@types/node` 26.2.0 across all ten
  declaring packages plus a lockfile dedupe, which collapses the duplicate
  vitest copies that broke typecheck ([#574]); the
  `@react-native/jest-preset` peer that `jest-expo` 57.0.4 requires, declared
  ahead of the Expo bump so all 109 jest suites still start ([#575]).
- **Dependencies:** React 19.2.8 ([#563]), the Expo SDK 57 patch wave
  ([#562]), Reanimated 4.5.3 ([#564]), Vite 8.2.1 ([#583]), and the rest of the
  Renovate wave ([#544] [#561] [#566] [#568] [#569] [#571] [#572] [#573] [#576]
  [#578] [#581]).

## 2026-W33 — 10 Aug – 16 Aug

Two switchable renderers, both off by default: the equities chart gained a
canvas substrate and the workspace gained Dockview as a second docking engine.
Jarvis panels could be pinned into the workspace, React Native Equities got
its mobile-v1 rehaul, and the RN visual tier stopped screenshotting a live
app. The week closed on a dependency-and-gates day.

### Added

- **Canvas chart renderer.** A "Chart renderer" preference draws the equities
  chart's geometry (candles, lines, grid, volume, drawings, panes, crosshair)
  immediate-mode on canvas; text stays DOM and DOM/SVG stays the default.
  Redraw is event-driven, with no rAF. [#520] Follow-ups: per-layer stroke
  widths ([#522]) and a closed `Canvas2D` `fillStyle` type hole, with a visible
  MACD histogram in the golden ([#528]).
- **Dockview as a second layout engine** — a `LayoutEngine` preference in both
  web clients (the in-house engine stays the default): drag tabs to re-dock,
  layout persisted per workspace tab, confined to the new leaf package
  `@rtc/layout-dockview`. [#534] Jarvis's collapse/expand intents now work under
  it; `resize` turned out never to have been a gap. [#555]
- **Pinned Jarvis panels** — a generated panel docks into the workspace as an
  ordinary tile (up to four), and the whole per-tab workspace (splits, rails,
  docked panels) survives a reload; "pin that panel" works through the drive
  vocabulary, and a Reset row restores defaults. [#532]
- **React Native Equities, mobile-v1** — a ranked movers board with Skia
  sparklines and a rank-move glide, a tick-flashing header, a Skia candle chart
  replacing the `react-native-svg` one, an order ceremony over all six ticket
  phases, blotter status pills, and the module's first visual scenarios. [#518]
  [#519]
- **Readable component names in the debug deploy** — rolldown's `keepNames` in
  both web clients' debug builds only; the lean build is byte-identical. [#530]

### Changed

- **The FPS meter keeps sampling under power-saver Freeze**, in all three
  clients — it is diagnostic, not decoration. Its rAF loop is marked, so the
  freeze census still asserts zero decorative rAF. [#531]
- **Preferences modal** split into reusable `ModalShell` chrome and
  `PreferencesContent`, with every row now pixel-asserted; the boot-animation
  toggle defaults to on (it only overrides `prefers-reduced-motion`). [#541]

### Fixed

- **Comparison line catch-up** — a compare turned on after scrolling back, or
  swapped mid-session, now backfills to the visible window instead of drawing
  a partial line. [#533]
- **The RN app crashed on its first Jarvis turn in WS mode** (`Property
  'crypto' doesn't exist`): Hermes has no Web Crypto, so the RN entry installs a
  polyfill backed by `expo-crypto`. [#523]
- **Light mode:** the boot splash starts on white, the boot canvas no longer
  draws the default skin's accents under every other skin, and the Admin
  Observability pane matches the panel chrome. [#537]
- **Deploy:** the debug build's alias for `@rtc/layout-dockview` swallowed its
  `/styles` subpath and failed both Vercel client builds. [#539]
- **CI typecheck flake** — `typecheck` and `build` shared one `tsbuildinfo`
  and raced; typecheck now writes its own. [#550]
- `/rtc:status` had been broken for ~19 days by `case` wrappers the `!`-block
  permission checker rejects. [#542]

### Decisions

- **[ADR-002](docs/adr/ADR-002-layout-management-port.md) rewritten** —
  Accepted as implemented, with Dockview as the first off-the-shelf adapter
  ([#534]); its Dockview-first gate for pinned panels was stale, so they
  shipped on the in-house engine ([#532]).
- **The RN visual harness renders a static fake ViewModel** instead of live
  simulator ports — spec ([#526]), plan ([#527]), built in [#536]. 20 of 21
  scenarios now reproduce exactly, the two equities scenarios have goldens at
  last, and tolerance is per-scenario and exact by default, because no global
  threshold separated a real change from noise.
- **Biome's `noImportantStyles` fix refused for the freeze catch-all** — its
  `!important`s are what outrank arbitrary animations — via a scoped override
  with its reason. [#552]
- **Renovate bumps that need source changes go on our own branch**, since a
  hand-push onto a Renovate branch disables its automation. [#547] [#552]

### Under the hood

- **RN coverage measured for the first time** — two tiers (jest 63.89% of
  statements, vitest 26.48%) that must not be added together; and
  `check:react-coverage`, which checked lint policy rather than coverage, is
  renamed `check:react-policies`. [#551]
- **Visual tier:** x86 golden syncs for the canvas renderer, prefs modal and
  admin chrome ([#521] [#524] [#529] [#538]); the RN `DRIFT.md` pairing derived
  from the golden tree instead of a hand-kept flag, plus two capture-tier
  defects ([#525]).
- **Docs:** what a worklet actually is, in the RN motion architecture doc
  ([#535]); three stale STATUS entries reconciled against live state ([#549]).
- **Dependencies:** the nanoid override raised to 3.3.18 after its advisory was
  re-scoped ([#543]); async-storage 2 → 3, inlined in vitest since v3 dropped
  CommonJS ([#547]); Biome 2.5.2 → 2.5.8 with the findings its new rules raise
  ([#552]); dependency-cruiser 18 and the Renovate wave ([#75] [#115] [#119]
  [#548] [#553] [#554] [#556] [#557] [#558] [#559] [#560]).

## 2026-W32 — 3 Aug – 9 Aug

The equities chart reached the TradingView tier: indicator panes, a log axis,
round-number ticks, drawing tools and a comparison series, in both web clients.
Jarvis grew live floating panels, learned to drive the app and speak first, and
gained a spending gate and a demo guide. On React Native, the open-items list
was worked down and the Appearance surface became a bottom sheet.

### Added

- **TradingView tier on the equities chart**, in both web clients: RSI and MACD
  indicator panes ([#475]); a linear/log price-axis toggle, with one pluggable
  price↔y mapping so candles, crosshair and overlays cannot disagree ([#480]);
  round-number ticks anchored to price in both modes ([#485]); drawing tools —
  trendlines and horizontal levels, drawn, selected and deleted ([#493]), then
  drag-edited ([#501]); and a comparison series on a percent-change axis with
  VS pills ([#508]) that pages older candles alongside the primary ([#514]).
- **Jarvis generative UI, round 1** — Jarvis authors closed-vocabulary
  `PanelSpec`s through a server-side `render_panel` tool; both web clients show
  them as floating HUD panels bound to live ticks, which survive closing the
  chat and change form in place on request. Five renderers; the scripted brain
  demos it all with zero tokens. Spec [#477], built [#488].
- **Jarvis drives the app and speaks first** — a `drive_app` tool over a closed
  `DriveCommand` vocabulary, and a proactive narrator triggered by detected
  market anomalies. [#498]
- **Jarvis usage auto-gating** — an estimated-USD budget per 5-hour window
  (default $1, `RTC_JARVIS_BUDGET_USD`): at 80% the expensive brains leave the
  picker, at 100% only Scripted remains, enforced per turn on the server and
  shown in both clients. [#505]
- **Jarvis discoverability** — one guide catalog feeding rotating hint chips,
  an ⓘ demo-guide panel and a hands-free scripted demo that spends no tokens.
  [#516]
- **React Native Appearance sheet** — a bottom sheet with a three-way mode
  segment, a 3×2 skin grid and the ambient picker. Spec [#510], built [#513].

### Fixed

- **RN shell and boot:** Replay Boot did nothing, for three stacked reasons
  ([#474]), and then showed only a one-frame flash because the fade value
  outlived the splash ([#515]); the header's text buttons, which pushed Sign out
  off screen, became the prototype's two glyphs ([#490]); the status strip's
  centre is kept clear of the dock button, which had hidden the FPS cell
  ([#507]).
- **The RN open-items list worked down from 31 entries to 14** — the
  reanimated jest mock, the Exposure bubbles to the mobile design, the P&L delta
  window, the FPS clock resync and a three-level power-saver control among the
  fixes; the rest reclassified or re-diagnosed. [#483] [#484]
- **Two ReDoS security alerts closed**, one of them quadratic on free chat
  text, and gauntlet↔CI parity restored. [#496]
- **E2e suites seed the narrator off** — default-on narration was landing
  mid-test ([#502]); the live smoke's panel prompt now names an unambiguous
  pair ([#503]).

### Decisions

- **Observability: Sentry behind a repo-owned port, W3C Trace Context and OTLP
  on the wire** — nothing auto-instruments WebSockets, so the vendor choice
  came down to backend, UX and cost. Spec only ([#491]), re-verified with
  errata and two more vendors weighed ([#497]).
- **RN Appearance: adopt the design's form, keep our fuller content** — the
  prototype has no slot for System mode, the ambient variants or the
  power-saver ladder, and matching it literally would delete them. [#510]
- **The Expo bundle-smoke tolerance deleted** — the crash it hid was already
  fixed; the evidence that it was live came from grepping the CI log's echo of
  the script itself. A worklets/reanimated bump raised to test it was
  reverted. [#506]
- **The RN visual-tier bake-off is unfinished, not decided** — it was a
  three-scenario iOS spike, and Maestro stays because `simctl` cannot
  screenshot Android ([#499]); Maestro's JDK floor is 17, pinned to 21 as the
  newest that runs clean ([#504]).

### Under the hood

- **RN visual tier:** Rates gets pixel coverage through a pricing pin ([#486]);
  a shell-chrome golden ([#489]); the expo dev-menu bubble hidden from captures
  ([#492]); a boot golden mismatch measured to be a live pulse, not a
  regression ([#479]); the React Native Analytics module closed against
  the prototype, its fidelity gaps recorded ([#481]).
- **Web visual tier:** x86 golden syncs for each chart feature ([#476] [#482]
  [#487] [#494] [#509]).
- **Docs and STATUS:** RN logged as having no coverage measurement and no UI
  contract tier ([#495]); the Jarvis P5 entry closed ([#500]) and the Jarvis
  backlog reconciled ([#511]); the discoverability idea and panel-composition
  riffs captured ([#512]); the RN Equities mobile-v1 plan ([#517]).
- **Dependencies:** four audit advisories cleared — fast-uri, brace-expansion,
  postcss, undici. [#478]

## 2026-W31 — 27 Jul – 2 Aug

Jarvis, the AI desk assistant, went from a scripted surface to a real
Anthropic agent with an MCP endpoint and a brain picker in one week. The
equities chart became interactive, gained a navigator and on-demand history,
and the visual tier's tolerance was measured and tightened twelvefold. On
React Native, the blank and frozen boot scenes were finally fixed on device and
Credit was rebuilt to the prototype.

### Added

- **Jarvis, in five steps.** A scripted assistant in both web clients — header
  orb, a ⌘/Ctrl+J cinematic overlay, typed-out replies, suggestion chips and a
  confirm-gated trade card ([#405], receipt in [#414]); the brain moved
  server-side behind a `JARVIS_*` WebSocket wire with no change to the
  machine, the UI or the goldens ([#440]); a real `claude-opus-5` agent
  reasoning over seven desk tools in the new `@rtc/agent-tools` package, with
  the scripted loop kept as the CI path and demo fallback ([#444] [#446]); the
  same tools exposed to external MCP clients at `/mcp`, so a trade from Claude
  Desktop or Code lands in the running app's blotter ([#453]); and a brain
  picker — Scripted, Haiku 4.5 (the new default), Sonnet 5 or Opus 5, plus
  effort — with per-turn routing, an in-memory usage meter, a footer chip and
  an Admin usage card ([#472]).
- **Interactive equities chart** in both web clients: cursor-anchored wheel
  zoom, drag and keyboard pan with BACK TO LIVE, a crosshair readout,
  candle/line/area types, a volume pane and SMA 20 / EMA 50 overlays. [#409]
- **Chart navigator** — a full-history strip under the chart whose brush *is*
  the viewport: drag to pan, resize to zoom, click to jump ([#417]); polished
  so a drag re-runs only the window style, with register, box and handle-clamp
  fixes ([#434]).
- **Candle backfill paging** — panning near the left edge fetches older
  300-candle pages down to a 3,000-candle depth, with `LOADING OLDER…` and
  `START OF HISTORY` chips, in simulator and both WebSocket modes. [#448]
- **Login-wait preferences** — pin the Handshake or Reactor treatment and add
  an artificial delay (Off / 1s / 3s / 6s) so the animations can actually be
  watched; the Preferences modal splits a new MOTION section out of DISPLAY to
  even its columns. [#410]
- **React Native:** the analytics exposure bubbles ported to Skia with the
  prototype's layered treatment and a settle animation ([#406]); Credit rebuilt
  to prototype fidelity — countdown ring, flat quote rows with the best quote
  tinted, an ACCEPTED stamp, chip-driven New RFQ and a sell-side stepper
  ([#451]).

### Changed

- **The repo relies on the React Compiler instead of manual memoization.** The
  compiler was switched on for the React Native client and the devtools
  extension (which had been shipping the inspector unmemoized), 36 of 39 memo
  sites removed, `useMemo`/`useCallback`/`memo` banned by lint, and a
  `check:compiler` gate asserts the values that lost their memos are still
  cached ([#421]). The ban's default-import hole was closed ([#431]), and a new
  gate requires every React package to declare an explicit React policy, so a
  new package cannot silently fall outside the rules ([#435]).
- **Visual tolerance from measurement, not assumption.** Five regenerations on
  five runners differed by zero pixels, so `maxDiffPixelRatio` dropped from
  0.06 to 0.005 for React ([#424]) and for the Solid parity gate, which had
  been left behind ([#430]); a `maxDiffPixels` cap of 100 then bounds the
  full-page worst case, which had been 10,368 px ([#436]).
- **Chart renderer seam** — every chart view model now computes a numeric
  `ChartScene` first, with CSS variables as a separate projection, proven by a
  Canvas-2D spike that renders the same scene in both clients. No behaviour
  change. [#463]

### Fixed

- **React Native boot scenes.** Five of the eight scenes rendered blank on
  device, including the live boot splash: three causes — worklets calling
  functions or module-level constants declared later in the file, and a
  missing `"worklet"` directive ([#439], after the investigation and one
  directive fix in [#413]). Separately, every scene had been frozen at t=0
  because an inline frame callback restarted its clock on each render ([#456]).
- **React Native Credit, found on device:** New RFQ quantity chips broadcast
  1000× the notional ([#454]); the accept ceremony was never visible, sell-side
  live tickets sat below the history, and quote prices had ragged decimals
  ([#455]).
- **Chart on slow hardware.** The Solid chart recreated its whole DOM per
  zoom/pan step and had no load-shedding, costing 3.45× React's main thread at
  8× CPU throttle; it now uses position-keyed slots and frame-coalesced gesture
  writes (1.24×) ([#427]). A horizontal scrollbar flickered on Windows during
  navigator drags ([#428]), and the 6px navigator handles gained an ~18px
  invisible grab target ([#429]).
- **Power saver:** Jarvis ring spins ignored the calm gate because the
  `animation` shorthand reset it, and the topology pulse respawned under
  freeze. [#420]
- **Jarvis follow-ups:** a confirmation teardown leak, spread turns without a
  tool badge, and confirm-card prices formatted like the tiles. [#415]
- **Deploy:** the Vercel CLI pinned to major 57 after 58.0.0 broke the
  env-linked `vercel pull`. [#419]

### Decisions

- **React vs Solid: no significant performance argument for Solid in this
  app**, measured on production builds with a new
  `pnpm perf:framework-compare` ([#425]). A rAF throttle for Solid's drag was
  built, measured as a no-op on fast hardware and reverted ([#426]); the
  slow-hardware fix then corrected the verdict ([#427]). All in
  [`docs/react-vs-solid-performance.md`](docs/react-vs-solid-performance.md).
- **The ViewModel seam and the React Compiler are mutually exclusive by
  construction** (118 of 123 bails) — documented, not fixed. [#421]
- **Two clients, one golden set:** the Solid tier's tolerance is the parity
  definition and must move in lockstep with React's. [#430]
- **MCP:** `execute_trade` is ungated at our layer because external clients
  own tool approval, and `/mcp` is mounted regardless of the Jarvis env gate
  ([#452]); the MCP SDK stays on 1.x until 2.0 is GA ([#469]).
- **Jarvis cost and billing:** deployed Jarvis is gated Anthropic-side with
  prepaid credits for now ([#460]); Haiku assessed as ~5× cheaper and
  expected sufficient ([#462]); governance round 1 is display-only, with no
  automatic gating ([#465]).
- **The prototype deviation corpus is never a CI gate** — the prototype is
  frozen, so a difference is never a failure. [#461]

### Under the hood

- **Jarvis docs:** the wire plan, plus two STATUS entries restored after a
  merge silently dropped them ([#432]); the agent-loop ([#441]), MCP ([#452])
  and brain-picker ([#467]) plans; the brain-picker spec ([#465]); the
  [running-real-Jarvis runbook](docs/running-real-jarvis.md) and a
  usage-governance backlog entry ([#457]); rate-limit and limits-trip
  behaviour ([#462]); the round's deploy follow-ups ([#473]).
- **Chart docs:** the navigator ([#411] [#416]) and backfill ([#437]) specs
  and plans.
- **React Native docs:** [`docs/rn-motion-architecture.md`](docs/rn-motion-architecture.md)
  — Skia vs Reanimated, and the frozen-boot case study ([#458]); running the app
  on a real iPhone for free ([#459]); the Credit plan ([#447]); the boot-scene
  STATUS entry corrected ([#433]); the deviation corpus — spec ([#461]), plan
  ([#464]) and 24 prototype shots with a generated `DRIFT.md` readable from a
  phone ([#468]).
- **Web goldens:** syncs after the interactive chart ([#412]), the navigator
  ([#418] [#442]), backfill ([#449]) and the canvas spike ([#466]); 132 drifted
  goldens refreshed, including a whole Jarvis re-skin the tier had missed
  ([#422]); 162 latent-drift local goldens resynced ([#438]).
- **React Native goldens:** every golden now asserts what the app draws —
  theme background, safe-area insets, a pinned status bar, a pinned `boot/topo`
  clock ([#443]); the two Credit goldens captured ([#470]); the seeded
  blotter's dates pinned so it stops re-dating daily ([#471]).
- **Tooling:** `/rtc:visual-tolerance-audit` and `pnpm visual:jitter` ([#424]);
  `pnpm check:worklet-order`, first a report ([#413]) and then a CI gate
  ([#439]); the gauntlet now mirrors CI's Cucumber hooks tests ([#431]); the
  motion audit's `--` argument fix ([#420]).
- **Presentations:** the Clean Architecture case-study Part II deck refreshed.
  [#423]
- **Dependencies:** `brace-expansion` overrides bumped to the corrected
  per-major fixes and the spent audit suppression dropped. [#450]

## 2026-W30 — 20 Jul – 26 Jul

The test-tooling bake-off ended: one winner per category kept, the rest
deleted or parked, and the post-merge visual job went from ~52 to ~15 minutes.
Around that, the React Native rehaul rebuilt Rates and Blotter and ported all
eight boot scenes to Skia, the DevTools inspector became timeline-first, and a
coverage sweep plus a new handler-naming lint rule went through the repo.

### Added

- **Timeline-first DevTools inspector.** Four tabs became one filterable event
  timeline; clicking a row pins the whole inspector to that moment, with
  Event / State / Diff panes, a rolling history buffer and a retroactive
  "Export last buffer". The protocol and hub are untouched. [#310]
- **React Native Rates and Blotter rebuilt to the mobile-v1 prototype** over an
  unchanged view-model seam — spot-tile grid, tick flash, filter glide, a
  bottom-sheet trade ticket and execution stamp ([#295]); the blotter's filter
  chips, fills summary and insert flash ([#301]).
- **React Native boot suite on Skia, eight of eight scenes.** A Skia boot
  canvas with `core` and `laser` on a shared 3D projection kernel, plus
  hold-to-unlock on the lock screen ([#314]); `core` and `laser` completed and
  `docking` added ([#353]); a shared projected-3D camera seam ([#375]); then
  `hologram` ([#382]), `layers` ([#383]), `geo` ([#390]), `jarvis` ([#391]) and
  `topo` ([#392]).
- **React Native Analytics:** the pair P&L bars animate on `scaleX` and the
  cards follow the prototype's order. [#403]
- **Waiting feedback on sign-in and unlock** in both web clients — two
  alternating treatments, and the lock screen now has an in-flight state at
  all. [#345]
- **Equities chart groundwork:** candles gain `volume` and a 300-deep history
  ([#395]); the pure viewport, crosshair and indicator maths in
  `@rtc/motion-core`, no UI yet ([#400]).
- **Server WebSocket connection logging** — one line per connect, disconnect
  and rejected upgrade, naming why, never the token. [#341]
- **Symmetric per-mode dev scripts** (`:sim`, `:ws:local`, `:ws:remote`, `:fs`)
  for all three clients, which also restores the RN app's lost `serverUrl`
  wiring. [#337]

### Changed

- **The test bake-off is over.** Both Cypress suites deleted — native
  Playwright drives the browser ([#297]); the playwright-ct and vitest-browser
  assert tiers retired with ~226 MB of goldens, leaving the Playwright golden
  tier as the visual contract ([#299]); the presenter tier collapsed to
  vitest with fake timers ([#300]); the Gherkin browser suites parked behind a
  weekly workflow ([#303]), and `cucumber-fake-timers` kept as a parked
  presenter-tier showcase beside them ([#318]). Solid reads `VITE_DEV_AUTH` like
  React, so `login.spec` runs on both clients ([#296]).
- **Visual CI is faster:** React and Solid run as a parallel job matrix with a
  cached build ([#311]); doc-only merges skip the job, and the container golden
  regen takes a scenario filter ([#339]); Solid's config honours
  `SCENARIO_PATTERN` ([#407]).
- **`@rtc/boot-splash`** — the boot-splash engine both web clients carried as a
  renamed copy, extracted into one framework-free package (−5,286 / +1,048
  lines). [#317]
- **`rtc/name-functions-by-effect`** — a lint rule that a handler is named for
  what it does, not what triggers it, with ~340 renames across 9 packages
  ([#394]); one-line handlers re-extracted rather than inlined ([#398]); the
  eight deferred findings closed ([#402]).
- **Dependency-cruiser's package-boundary rules actually fire.** They had been
  resolving `@rtc/*` to excluded `dist/` and enforcing almost nothing; a
  resolution-only tsconfig maps them to `src`, and 14 rules became
  allowlists. [#327]

### Fixed

- **The WebSocket connects only once signed in.** Before, the adapter connected
  in its constructor and retried a tokenless upgrade every 3 s on the login
  screen ([#306]); the RN wiring is pinned by a test ([#336]) and verified live
  against the deployed server using the new connection log ([#313] [#342]).
- **Every equities chart was pixel-identical** — the candle walk was seeded by
  timeframe only; the symbol is now mixed in. [#308]
- **Security:** a polynomial ReDoS in `parseNotional`, ~7.4 s → ~0.35 ms on a
  50k-digit input ([#323]); CodeQL's ReDoS step regexes and missing workflow
  token permissions ([#320]).
- **Power-saver freeze:** a delayed `backwards` animation held text invisible —
  the catch-all now zeroes delays too, the visual hosts load the real global
  stylesheet, and a computed-style spec witnesses it ([#355]); per-quote
  animation churn and resident paused loops removed, with a repeatable
  `/rtc:perf-audit` motion audit ([#388]).
- **React Native:** five of eight boot variants failed to persist ([#302]); the
  boot never cycled off `core`, faint splash mesh and a lock-ring worklet
  crash ([#340]); a `core` scene worklet crash on device ([#334]); boot-scene
  text drew nothing because `Skia.Font()` had no typeface — JetBrains Mono is
  now bundled ([#362]); a cold-Metro worklets Babel red-box ([#332]); the
  recurring `expo-env.d.ts` / `tsconfig.json` churn ([#361]); Rates
  stylesheets rebuilt on every tick ([#347]).
- **Vercel stopped auto-deploying on every push** — the off-switch only works in
  a file named exactly `vercel.json`. [#401]
- Native scrollbars and form controls follow the theme, so Windows Chrome
  matches macOS. [#335]
- **Flakes:** the DevTools pin step races a live stream — it now pins by
  `ArrowUp` ([#325]); the cucumber suites' fixed sleep and teardown timeout
  ([#404]), then teardown judged by whether the browser is still connected
  rather than by the clock ([#408]).
- The RN visual capture tapped blind at fixed coordinates and could pin the
  Expo launcher as a golden; it now polls the accessibility tree for
  readiness. [#350]

### Decisions

- **One tool per test category** — native Playwright for the browser, the
  Playwright golden tier for pixels, vitest with fake timers for the presenter,
  Gherkin parked and run weekly. The verdicts, timings and the proof nothing
  was lost: [`docs/test-bakeoff-outcome.md`](docs/test-bakeoff-outcome.md)
  ([#315]) and ADR-001's Outcome ([#299]); the four deferred follow-ups
  ([#305]); why `cucumber-fake-timers` over quickpickle as the parked peer
  ([#318]).
- **A prose-only overlap no longer forces a catch-up merge** — 53% of
  catch-ups were `docs/STATUS.md` alone ([#367] [#370]); a merge queue is
  unavailable on a user-owned repo ([#381]); a conflicting PR gets no CI run at
  all, so re-triggering cannot help ([#374]).
- **Handlers get names even at one line**, reversing the inline-arrow policy
  [#394] shipped with. [#398]
- **`gh pr merge` pre-approved repo-wide**, narrowed to that one verb. [#360]
- **The shared `.tsbuildinfo` typecheck race** behind a "flaky" CI run is
  logged with three fix options, the fix left to its own PR. [#377]
- **React Native boot and module plans:** hybrid declarative/imperative Skia
  rendering chosen per scene ([#309]); the rest of the boot-scene port split into
  non-projected and projected halves, then by scene ([#348] [#372] [#386]); the holo flicker
  threaded per draw call and no bloom anywhere ([#353]); `boot/topo` left
  unregistered as a golden because it prints a wall clock ([#393]).
- **The remaining React Native modules designed as Credit, Equities and
  Analytics**, with
  three design calls settled and a ledger of prototype/data-model mismatches
  ([#349] [#351] [#352]); the Analytics plan fixes the frozen positions below
  both clients ([#396]), done in [#397].
- **Equities chart interactivity design** — renderer-neutral maths in
  `@rtc/motion-core`, thin React and Solid gesture shells. [#387]
- **Jarvis re-phased** around the v5 prototype's scripted surface; voice out of
  scope. [#384]
- **The `ui-visual` coverage tier measures the golden matrix's reach**, not
  incidental pixel-tier coverage — renamed "visual reach" and added for Solid
  ([#358] [#369]); boot-splash's canvas drawing excluded from coverage with its
  reason inline ([#379]).

### Under the hood

- **Coverage sweep:** the Solid registries, server and domain tails ([#366]),
  the React wiring and client-app tails ([#371]), the ui-contract tail ([#380]),
  `client-core`'s ws-real RPC paths ([#389]) and devtools-core's bounds and
  guards ([#399]); `pnpm coverage:gaps` made to read lcov and merge tiers
  correctly ([#376]).
- **React Native CI and visuals:** a spike proves the iOS golden pin is
  reachable on free macOS runners ([#373]), behind a survey of mobile CI options
  ([`docs/mobile-ci-testing-options.md`](docs/mobile-ci-testing-options.md),
  [#357]); boot scenarios registered for the new scenes ([#385] [#393]); one
  page for every open RN item,
  [`docs/rn-open-items.md`](docs/rn-open-items.md) ([#356]).
- **Agent workflow:** `/rtc:gauntlet` and `/rtc:status` ([#364]), `/rtc:docs`,
  `/rtc:backfill-test-coverage` and the per-file gap analyser ([#365]), and
  fixes found by using them ([#368]); worktree freshness made mechanical in the
  shipping skill ([#307]).
- **Docs:** the bake-off docs synced ([#294] [#304]); the shared Gherkin corpus
  explained in [`tests/GHERKIN.md`](tests/GHERKIN.md) ([#324] [#326]); the §6
  package diagram stacked vertically ([#329]); the add-a-package recipe needs a
  `tsconfig.depcruise.json` entry ([#331]); the Clean Architecture case-study
  Part II deck and a fixed Part I build ([#319] [#333]); STATUS bookkeeping
  ([#298] [#313] [#316] [#328] [#330] [#344] [#346] [#359] [#363]).
- **Dependencies:** postcss and brace-expansion advisories that had reddened
  the audit gate on `main` ([#338]); the CRITICAL `@vitest/browser` and HIGH
  `fast-uri` advisories, moving the whole vitest train to 4.1.10 ([#343]); the
  last Dependabot alert, transitive `uuid` 7 → 11 ([#354]).

## 2026-W29 — 13 Jul – 19 Jul

The SolidJS client went from a walking skeleton to full parity with React in
one week, and the custom RTC devtools went from nothing to an inspector that
reaches React, Solid, React Native and deployed builds. Real login replaced the
Basic-Auth wall, power-saver mode arrived, and the React Native HUD rehaul
started. The visual-golden set was collapsed into one and then restored.

### Added

- **The SolidJS client, end to end.** `@rtc/solid-bindings` and a
  `@rtc/client-solid` walking skeleton ([#183]); the shell and FX subtree with a
  byte-equality CSS parity gate ([#184]); credit, equities and admin, passing
  all 82 shared UI-contract spec files ([#216]); pixel parity, with all three
  visual tiers asserting against React's goldens and Solid owning none
  ([#230]); the shared e2e suites run against Solid, which caught a real
  double-fire bug in the notional input ([#240]); the login gate ([#241]); and
  full RTC-devtools wiring with its own `/devtools/` panel ([#262]). Solid
  Devtools instrumentation for development builds only ([#185]).
- **Custom devtools for the RxJS state layer** — `@rtc/devtools-core`
  (decorators at the composition root, a dormant-until-attached hub) and
  `@rtc/devtools-app`, a four-panel inspector served at `/devtools/` ([#188]).
  Then, the same week: intent injection from the panel, the first inbound
  write ([#211]); an MV3 Chrome extension that attaches to any running
  instance, deployed builds included ([#213]); record, replay and
  time-scrubbing with JSON export, entirely panel-side ([#221]); and React
  Native inspection over a dev-machine WebSocket relay, `@rtc/devtools-relay`
  ([#227]), with intent injection on RN too ([#235]).
- **A login screen and genuine server-side authentication** — a scrypt-checked
  roster, an HMAC-signed token that gates the WebSocket upgrade, and a real
  password re-auth lock screen, on every client ([#210]). React Native gets its
  own login screen with the Sim/Live toggle reachable before sign-in ([#226]),
  session persistence across cold launches and a sign-out button ([#234]).
- **Power-saver mode** — one persisted switch that removes the ambient GPU
  layers and conflates price rendering ([#218]), then a three-state ladder,
  Off / Calm / Freeze, where Freeze stops all decorative motion for GPU-less
  remote desktops ([#245]). An **"Always play boot animation"** preference
  overrides `prefers-reduced-motion` for the splash alone ([#255]).
- **Aurora ambient background** from the v5 design, selectable against the
  existing rays via an Ambient-style preference, and a **draggable Preferences
  dialog** ([#259]).
- **Live FPS and memory readouts** in the HUD status bar, replacing two static
  numbers, frozen in the test harnesses so goldens stay stable ([#231]); a
  **HUD-logo favicon** on both web clients ([#219]).
- **React Native rehaul toward the mobile-v1 prototype, first four stages** — the native motion and render
  stack (Reanimated, Skia, gesture-handler, Expo native modules) with no
  visible change ([#220]); theme completion, a Skia ambient background, an
  Orbitron wordmark and a rebuilt Appearance sheet ([#228]); a Mac-local
  simulator visual harness ([#232]) with Maestro and owl tiers ([#236]),
  repaired so scenarios render outside the login gate and scored in a tier
  bake-off ([#279]); and the HUD shell — header, status strip and a radial
  command dock replacing the tab bar ([#285]).
- **A multi-producer GitHub Pages site** on a `gh-pages` branch, where the
  coverage report and presentation decks publish without clobbering each other
  ([#198] [#200] [#204]), plus a published **visual-diff failure report** at
  `/visual/` ([#280]).
- **Deploy Solid** to `rtc-clone-solid.vercel.app` ([#257]).

### Changed

- **One `Deploy` workflow** with React / Solid / server checkboxes and a
  sourcemaps toggle; the React target becomes `rtc-clone-react` ([#281]). The
  debug build then actually works: inline maps, because Vercel refuses to serve
  `.map` files ([#284]), and `@rtc/*` libraries resolved from source with
  distinct `-dbg-` filenames ([#290]).
- **The `pnpm dev*` scripts became an orthogonal matrix** — client ×
  simulator / attached server / full stack ([#225]) — and `pnpm dev` went back
  to being a zero-setup simulator alias of `dev:react` ([#229]).
- **Demo credentials are committed** so `pnpm dev` can sign in out of the box
  ([#237]), and every client's demo password was standardised to the same value
  ([#238]).
- **The ambient animated background is on by default** on the web clients,
  after measuring it as compositor-only; React Native stays off ([#203]).
- **Web design prototype v5** added under Git LFS (the repo's first use of it)
  and made the current prototype ([#186] [#187]).
- The account menu's Lock Session and Sign Out rows now match the rest of the
  list, in title case, with only Sign Out in red ([#246] [#260]).
- The devtools inspector repaints at ~15 Hz from one animation frame instead of
  on every batch, which had starved the panel under CPU load ([#191]); six
  hardening follow-ups — bounded registries, a typed event builder, a liveness
  timeout, identity-stable rows with React Compiler, a WAAPI change-flash and a
  production copy-path check ([#209]).

### Fixed

- **LiveRates sparklines keep their history** when a currency filter hides and
  re-shows a tile, instead of restarting from zero ([#242]).
- **The instrument dropdown and blotter filter popovers are frosted again**,
  not see-through, with an opaque fallback under power saver ([#249]).
- **Solid e2e was stranded on the login screen** (main red) because the client
  ignored the seeded session; it now persists sessions in `localStorage` ([#247]).
- **React Native bundles and runs on the simulator** — a Babel 8 leak into the
  worklets plugin and an FPS worklet-boundary crash, both invisible to jest
  ([#289]).
- The devtools inspector connects whichever side opens first ([#189]) and
  paints edge to edge ([#190]).

### Decisions

- **One container-canonical golden set: built, then reverted.** The emulated
  x86 container was measured byte-identical to CI on any host ([#263]), so the
  per-architecture sets were deleted ([#272] [#273] [#274]) — and restored a
  day later because it killed the fast, Docker-free native loop ([#275]).
  Recorded in ADR-001, with the two axes of golden duplication ([#276]).
- **Devtools intent injection is gated by a runtime flag, not dead-code
  elimination**, so React Native can use it; the bundle-grep CI gate goes, and
  relay Origin-hardening is skipped as dev-only ([#235]).
- **The Solid coverage gate holds branches at 85, not 95** — Solid's compiler
  inflates the branch denominator with arms no test can reach ([#216]). Solid's
  component-test visual tier is a full-page fallback because
  `@playwright/experimental-ct-solid` is frozen at 1.48 ([#230]).
- **react-native-owl is not viable** on RN 0.86 / React 19 (the RN visual
  harness's `BAKEOFF.md`, [#279]).
- **Ending the test-tooling bake-off** — plain Playwright as the sole CI visual
  tier, Cypress deleted, the Gherkin suites off the PR gate: the plan and its
  locked decisions, not yet executed ([#293]).
- **Catch-up before merge is risk-based**, not automatic; a merge queue goes to
  the new `docs/IDEAS.md` icebox ([#201]).
- **Parked:** a general blank-line-between-blocks lint rule, with its measured
  blast radius ([#288]).
- **Designs and plans:** the devtools Chrome extension ([#194]), hardening
  ([#205]), intent injection, record/replay and RN inspection ([#206] [#207]);
  the RN mobile-v1 rehaul's phased spec and its first plans ([#208] [#224]).

### Under the hood

- **Visual goldens:** repins after the power-saver header ([#223]), the frosted
  popovers ([#256]) and four drifted merges ([#261]), and the Aurora gap — its
  scenario had been merged with no goldens ([#266]); a `goldens:regen` /
  `goldens:verify` container wrapper ([#265]); a fix for a first-mount race
  that broke filtered runs ([#268]); a scenario filter and auto-commit for
  `update-visual-goldens`, kept off `main` ([#269] [#291]); a drift guard for
  the Playwright image tag ([#270]); the golden trees moved to
  `@rtc/ui-contract` ([#286]); an `UPDATING-GOLDENS` runbook ([#277]); status
  and gitignore wrap-up ([#271] [#283]).
- **Lint:** a blank line between multiline declarations, 456 spots autofixed
  ([#243]); a committed ESLint-warning ledger with a CI drift gate ([#250]);
  `newspaper-order` moves `jest.mock` below the tests, as it does `vi.mock`
  ([#287]).
- **Docs:** `docs/STATUS.md`, the cross-workstream pending backlog, with a
  maintenance skill and a drift hook ([#196] [#278]); §21 "One Test Suite, Two
  Frameworks" ([#282]); `docs/boot-splash-animations.md` with a
  readability rename of the draw code, proven safe by a fingerprint verifier
  ([#197] [#199]); framework DevTools vs the RTC inspector ([#264]); the docs
  map and idea lifecycle ([#202]); devtools docs sync ([#215]); a
  Clean Architecture case-study deck ([#193] [#195]); TOC fixes ([#192]); the
  CI-polling budget in `shipping-repo-changes` ([#254]).
- **Backlog upkeep** in `docs/STATUS.md`: [#214] [#217] [#222] [#233] [#239]
  [#251] [#252] [#253] [#258] [#267] [#292].

## 2026-W28 — 6 Jul – 12 Jul

The web client was rebuilt to the v2 design prototype screen by screen, then
made cheap to run: steady-state animations moved to the compositor and the
traps were written down. Alongside, the architecture docs became a split,
link-checked atlas, a family of WebSocket subscription leaks was closed, the
React Native client moved to Expo SDK 57, and the SolidJS port took its first
step.

### Added

- **The v2 prototype's screens, one PR each.** Dock drag, maximize and
  collapse behaviour plus FX chrome ([#114]); working FX Watchlist and
  Activity views in place of "coming online" placeholders ([#118]); Credit as
  a three-panel dock — New RFQ form, dealer-quote RFQ cards, blotter ([#123]);
  Equities as a four-panel dock with timeframe candles carried as real data
  from the domain through the wire to the chart, an order ticket and a
  rank-gliding watchlist ([#125]); Admin as an observability board with KPI
  cards, glow charts, service health and live events ([#124]).
- **v3 and v4 design sync** — an executing spinner on tiles, "isotope" filter
  choreography on the rates grid and watchlist, the ambient dots visible
  through the holo skins, and five new boot scenes ([#164]); the core boot
  splash rebuilt as a global market mesh of trading hubs and order-flow arcs
  ([#170]).
- **React Native on Expo SDK 57 / RN 0.86**, with build profiles that need no
  paid Apple account and are bound to their EAS environments ([#116] [#121]),
  a root `dev:ios` script ([#122]) and a README for the new run and
  distribution options ([#120]). A v2 visual pass gave the mobile app elevated
  FX cards, a polished shell and "3D" skins that are really 3D ([#143]), then
  carried a shared card and spacing scale to Credit, Equities, Analytics and
  the blotters ([#147]).
- **`@rtc/motion-core`** — the DOM-free animation math behind the FLIP and
  rank-glide hooks, extracted so a second UI framework can reuse it. [#174]
- **Design prototypes in the repo:** v3 ([#157]); `docs/design/` split into
  `web/` and `mobile/` with web v4 and mobile v1 added and a deploy target per
  side ([#166] [#169]); root `dev:proto` and `dev:design` scripts, the latter
  a zero-dependency Node server ([#108] [#109] [#110]); a README for
  `client-prototype` ([#106]).

### Changed

- **Steady-state animations run on the compositor** — same visuals, about 40%
  less CPU on FX ([#139]), and Credit and Equities with their main thread idle
  ([#141]).
- **Two fidelity punch-lists against the live prototype:** 15 items of shell
  chrome, dock geometry and panel polish ([#127]); then a 22-item second round
  across FX, themes, the layout engine, the shell and Admin, which was merged,
  reverted and re-landed reconciled with the new animation rules
  ([#136] [#138] [#144]).
- **The UI contract suite moved to its own package, `@rtc/ui-contract`** —
  all 82 specs framework-neutral, the first step of the SolidJS port. [#182]

### Fixed

- **WebSocket subscriptions no longer accumulate.** Toggling the FX filter
  multiplied the tick rate because the client could not unsubscribe and the
  server merged a fresh stream per subscribe ([#171]); the same leak in
  equities quotes and depth, and on every tab switch, is closed too ([#172]);
  a whole-app sweep fixed a server timer leak in the credit RFQ simulator and
  kept the Admin charts warm across tab visits ([#173]).
- **The deployed server crash-looped on Fly** — `tsc-alias` rewrote the `ws`
  import to the same-named local folder; the folder is now `src/socket`. [#134]
- **The deployed web app opened no WebSocket** — Turbo's strict env mode
  stripped `VITE_SERVER_URL` from the build; a deploy guard now fails loudly.
  [#150]
- **The React Native app crashed at boot** under Metro, from a missing Babel
  preset and a stale `@expo/metro-runtime`. [#111] [#112]
- Bugs found while porting the screens: the activity feed and Admin event log
  lost their history on every tab switch ([#118]); the docked New RFQ form
  dead-ended after its first submission ([#123]); the Admin throughput chart
  was a permanently flat line ([#124]).
- `clean:deep` reaches every package, including RN's generated `ios/` and
  `android/`. [#107] [#126]

### Decisions

- **The visual-diff gate runs after merge, not on PRs**, while the UI churns
  — the reasoning and the way back are in ADR-001. [#158] [#160]
- **Where UI logic lives** — RxJS machine, plain hook, or pure function plus a
  thin framework shell: [ADR-005](docs/adr/ADR-005-ui-logic-placement.md). [#174]
- **Keep singleton streams warm on the client instead of coalescing duplicate
  subscribes on the server**, because coalescing would drop the first-subscribe
  state-of-the-world replay (recorded in [#172]).
- **The second fidelity round was reverted, then re-landed** — the revert was
  prompted by a suspected stale build, and the re-land reconciled it with the
  animation rules. [#138] [#144]
- **Designs and plans merged ahead of their work:** power-saver mode ([#140]),
  atomic test-ID renames via a shared registry package ([#154]), custom
  DevTools for the presenter layer ([#168]), login with server-side
  authentication ([#176]), the Jarvis AI assistant and its capability roadmap
  ([#177], with architecture chapters §18–§19 in [#178] [#179]), the SolidJS
  port ([#180]), and RN visual snapshot testing as a Mac-local, non-gating
  suite ([#149]).

### Under the hood

- **Architecture docs** — synced with the multi-client reality, with animated
  diagrams and theme-safe, narrower Mermaid ([#128] [#129] [#130] [#131]), a
  Clean Architecture rings primer ([#135] [#137]), satellite docs and sandbox
  isolation caught up ([#132] [#133]); `docs/architecture.md` split into one
  file per section ([#148]); the Codebase Atlas — §13–§16, decision
  narratives, READMEs for every package and a CI doc-link check ([#151]); §17
  on the web client up close ([#162] [#165]) and the custom-hook surface
  ([#175]).
- **Performance and environment docs:** [`docs/performance.md`](docs/performance.md),
  the catalogue of rendering traps, fix patterns and profiling recipe
  ([#142]); [`docs/env-files.md`](docs/env-files.md), every `.env` file and a
  token-rotation checklist ([#163]).
- **Gates:** braces on every control statement (Biome `useBlockStatements`,
  521 fixes) ([#145]); every workspace must declare `typecheck` and a test
  script ([#146]); dependency-cruiser pair rules naming all nine packages and
  RN dumb-UI grep gates 30–33 ([#155]); the React-hooks and component-order
  lint rules extended to RN ([#153]); render functions became components under
  a new `rtc/no-render-functions` rule ([#165]).
- **Visual goldens:** the full theme matrix — five skins × dark/light at
  1920×1080 ([#152]); real app fonts and an uncropped Admin ([#156]); layout
  scenarios at real workspace size ([#159]); deterministic webfont loading
  that ended a golden width race ([#161]); a v3 regen with a contract-tier
  coverage audit, 95% → 97% branch ([#167]).
- IntelliJ stops indexing generated folders. [#181]
- **Dependencies:** Biome 2.5.2 and tsc-alias 1.9.0. [#113] [#117]

## 2026-W27 — 29 Jun – 5 Jul

The first week in which every change went through a PR. The web client's HUD
redesign finished, and two new clients went from nothing to complete screens.
The app layer was pulled out into a shared `@rtc/client-core`, and a React
Native app grew on top of it in eight phases. A readable React port of the v2
design prototype was built screen by screen. The server was rewritten on a
declarative WebSocket effects library and now serves equities too.

### Added

- **Equities trading module**: watchlist, canvas candlestick
  chart, depth ladder, order ticket with fill choreography, orders and
  positions blotters, P&L gauge and sector heatmap, over three new seedable
  domain simulators. [#43]
- **Admin observability dashboard**: gauges, throughput, latency
  and error charts, sessions, a live event log and a service-topology graph.
  Injecting an incident drives the real connection banner to DISCONNECTED, and
  the overlay offers a **Clear incident** button. [#49]
- **System theme.** The header toggle cycles dark → light → system, following
  the OS `prefers-color-scheme` ([#54]). **Two 3D skins**, `holo3d` and
  `terminal3d`, each added as one token entry per client ([#100]).
- **React Native client** (`@rtc/client-react-native`, Expo SDK 55), in eight
  phases: the scaffold and monorepo wiring ([#61]); a live spot-tile grid
  against the Fly server with a simulator toggle ([#69]); tap-to-trade and a
  blotter ([#82]); Analytics and P&L in `react-native-svg` ([#85]); skin × mode
  theming with bundled fonts ([#92]); the boot splash and lock overlay ([#95]);
  the Credit RFQ desk ([#98]); and Equities, with Appearance moved to a toolbar
  gear ([#102]). A cold-start runbook covers the live WS token and running on a
  device ([#73]).
- **`@rtc/client-prototype`**: a readable, self-contained React port of the v2
  design prototype. It covers the scaffold, themes and canvas boot sequence
  ([#57]), shell chrome ([#60]), FX ([#72]) and its Analytics and Positions
  aside ([#80]), Credit plus a shared dock ([#84]), Equities ([#87]) and Admin
  ([#90]). A final parity pass against the HTML prototype closed the remaining
  gaps ([#96]).
- **Equities over WebSocket.** The server now serves equities, which until then
  ran only in the in-browser simulator. A fullstack e2e proves it. [#91]
- **Prototype deploys** became an on-demand, version-configurable button
  ([#46]). They were then split into two deploys, the Claude Design HTML mockup
  and the React port, each with its own Vercel project ([#97]).
- **The full istanbul coverage report is published to GitHub Pages**, next to
  the job-summary view. [#44]

### Changed

- **HUD reskin of FX and Credit**: glass panels, display and mono type, and
  tick, fill, reject and expiry flashes driven by the live domain streams, with
  no behaviour change ([#41]). A closing pass re-verified every tier across
  the redesigned client ([#51]). Open deferrals were closed: presenter tests and a
  layout splitter-drag e2e ([#54]). The vestigial `admin-throughput` panel was
  removed ([#52]).
- **v2 fidelity** for the main web client: self-hosted fonts, v2 tokens, the
  four-layer aurora, glass chrome and a faithful FX tile ([#88]). Demo data was
  made realistic in the domain, so web, server and RN share it; the FX right
  column became a fixed 360px rail with a new Positions panel, retiring the
  `d3-force` cluster; and the nav and panel heads took the prototype's chrome
  ([#105]).
- **The app layer was extracted** into `@rtc/client-core` (neutral presenters,
  machines and composition) and `@rtc/react-bindings` (the React ViewModel
  bridge). `client-react` became a thin DOM shell. [#56] The UI seam had been
  renamed from `Hooks`/`AppHooks` to `ViewModel` just before, a pure rename
  ([#55]).
- **The server runs on `@rtc/ws-effects`**, a new `rxjs`-only declarative
  WebSocket effects library with per-effect error isolation. It replaces the
  738-line `switch` handler with 24 effects. The wire protocol is unchanged, and
  the protocol constants moved into `@rtc/shared`. [#91]
- **Deploys:** the main app deploys only on demand, because Vercel's Git
  auto-deploy is now off ([#48]). The Fly server scales to zero when idle
  ([#45]).

### Fixed

- **The Cypress e2e flakes were fixed at their source**, a reload-unsafe report
  and command-queue races, and test-level `retries` were removed. [#66]
- `placeOrder$` answers a failed order with a nack and keeps serving, where it
  used to leave the client's RPC hanging. [#93]
- The prototype rendered as an empty shell in real browsers, because `.shell`
  had no definite height. [#104]
- Prototype deploy runs went red on Vercel's deployment protection; the smoke
  now checks the canonical alias. [#101]
- A FLIP glide started from a stale origin after a resize, and the tile showed a
  "▲ 0 pip" badge on its first paint. [#94]
- The StatusBar x86 golden flaked in width ([#42]). An RN analytics test timed
  out on loaded x86 CI ([#89]).

### Decisions

- **ADR-004**: the UI seam is a `ViewModel`, and feature flags are layered
  behind a port. The flag layering was documented only ([#55]). Research then
  chose Flagsmith behind OpenFeature, with a dependency-free static adapter as
  the default; this landed as a spec and plan, not code ([#83]).
- **React Native choices**: Expo SDK 55 rather than the just-published SDK 57,
  so the 24-hour release cooldown holds ([#61]); component tests run under
  `jest-expo`, because vitest cannot parse RN's Flow source ([#69]); and
  `d3-force` was replaced by a deterministic shelf-packing layout ([#85]).
- **Build `ws-effects` from scratch instead of adopting marblejs**, which is
  unmaintained and pulls in a vulnerable `ws`. The runtime topology is now
  documented in `docs/architecture.md`. [#86]
- **The visual tolerance `maxDiffPixelRatio: 0.06` was recorded as settled**,
  and forcing font hinting off was rejected. That ratio has since been
  tightened. [#81]
- **Renovate auto-merges** GitHub Actions bumps and patch or minor
  devDependency bumps once CI is green. Majors and production dependencies stay
  manual. [#76]
- **Deploy config:** only real credentials should be secrets. The cleanup was
  planned but its execution deferred ([#103]). Meanwhile the prototype project
  id became a secret too, for consistency ([#99]).

### Under the hood

- **Four new lint rules**: no inline `style={{…}}` in client source ([#47]);
  `rtc/newspaper-order`, tests before helpers, autofixed across about 80 files
  ([#50]); one class per file, with the filename matching the class ([#53]);
  and `rtc/component-newspaper`, one exported component per `.tsx` that comes
  first, with 67 files reordered ([#59]).
- **Agent workflow:** `shipping-repo-changes` fetches before it branches and
  catches up to `main` before it merges. [#58]
- **Dependencies:** `@babel/core` 8, Biome 2.5.1, pnpm 11.9.0, two React Native
  libraries, and four GitHub Actions majors for cache and Pages. [#25] [#27]
  [#62] [#63] [#64] [#65] [#68] [#70] [#71] [#74]

[#25]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/25
[#27]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/27
[#41]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/41
[#42]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/42
[#43]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/43
[#44]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/44
[#45]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/45
[#46]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/46
[#47]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/47
[#48]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/48
[#49]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/49
[#50]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/50
[#51]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/51
[#52]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/52
[#53]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/53
[#54]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/54
[#55]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/55
[#56]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/56
[#57]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/57
[#58]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/58
[#59]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/59
[#60]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/60
[#61]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/61
[#62]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/62
[#63]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/63
[#64]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/64
[#65]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/65
[#66]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/66
[#68]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/68
[#69]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/69
[#70]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/70
[#71]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/71
[#72]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/72
[#73]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/73
[#74]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/74
[#75]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/75
[#76]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/76
[#80]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/80
[#81]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/81
[#82]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/82
[#83]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/83
[#84]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/84
[#85]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/85
[#86]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/86
[#87]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/87
[#88]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/88
[#89]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/89
[#90]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/90
[#91]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/91
[#92]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/92
[#93]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/93
[#94]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/94
[#95]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/95
[#96]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/96
[#97]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/97
[#98]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/98
[#99]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/99
[#100]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/100
[#101]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/101
[#102]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/102
[#103]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/103
[#104]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/104
[#105]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/105
[#106]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/106
[#107]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/107
[#108]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/108
[#109]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/109
[#110]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/110
[#111]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/111
[#112]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/112
[#113]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/113
[#114]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/114
[#115]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/115
[#116]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/116
[#117]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/117
[#118]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/118
[#119]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/119
[#120]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/120
[#121]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/121
[#122]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/122
[#123]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/123
[#124]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/124
[#125]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/125
[#126]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/126
[#127]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/127
[#128]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/128
[#129]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/129
[#130]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/130
[#131]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/131
[#132]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/132
[#133]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/133
[#134]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/134
[#135]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/135
[#136]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/136
[#137]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/137
[#138]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/138
[#139]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/139
[#140]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/140
[#141]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/141
[#142]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/142
[#143]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/143
[#144]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/144
[#145]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/145
[#146]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/146
[#147]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/147
[#148]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/148
[#149]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/149
[#150]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/150
[#151]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/151
[#152]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/152
[#153]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/153
[#154]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/154
[#155]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/155
[#156]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/156
[#157]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/157
[#158]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/158
[#159]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/159
[#160]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/160
[#161]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/161
[#162]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/162
[#163]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/163
[#164]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/164
[#165]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/165
[#166]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/166
[#167]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/167
[#168]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/168
[#169]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/169
[#170]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/170
[#171]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/171
[#172]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/172
[#173]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/173
[#174]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/174
[#175]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/175
[#176]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/176
[#177]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/177
[#178]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/178
[#179]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/179
[#180]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/180
[#181]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/181
[#182]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/182
[#183]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/183
[#184]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/184
[#185]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/185
[#186]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/186
[#187]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/187
[#188]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/188
[#189]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/189
[#190]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/190
[#191]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/191
[#192]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/192
[#193]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/193
[#194]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/194
[#195]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/195
[#196]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/196
[#197]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/197
[#198]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/198
[#199]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/199
[#200]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/200
[#201]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/201
[#202]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/202
[#203]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/203
[#204]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/204
[#205]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/205
[#206]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/206
[#207]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/207
[#208]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/208
[#209]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/209
[#210]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/210
[#211]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/211
[#213]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/213
[#214]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/214
[#215]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/215
[#216]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/216
[#217]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/217
[#218]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/218
[#219]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/219
[#220]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/220
[#221]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/221
[#222]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/222
[#223]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/223
[#224]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/224
[#225]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/225
[#226]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/226
[#227]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/227
[#228]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/228
[#229]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/229
[#230]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/230
[#231]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/231
[#232]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/232
[#233]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/233
[#234]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/234
[#235]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/235
[#236]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/236
[#237]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/237
[#238]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/238
[#239]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/239
[#240]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/240
[#241]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/241
[#242]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/242
[#243]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/243
[#245]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/245
[#246]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/246
[#247]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/247
[#249]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/249
[#250]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/250
[#251]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/251
[#252]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/252
[#253]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/253
[#254]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/254
[#255]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/255
[#256]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/256
[#257]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/257
[#258]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/258
[#259]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/259
[#260]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/260
[#261]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/261
[#262]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/262
[#263]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/263
[#264]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/264
[#265]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/265
[#266]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/266
[#267]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/267
[#268]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/268
[#269]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/269
[#270]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/270
[#271]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/271
[#272]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/272
[#273]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/273
[#274]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/274
[#275]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/275
[#276]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/276
[#277]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/277
[#278]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/278
[#279]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/279
[#280]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/280
[#281]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/281
[#282]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/282
[#283]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/283
[#284]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/284
[#285]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/285
[#286]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/286
[#287]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/287
[#288]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/288
[#289]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/289
[#290]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/290
[#291]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/291
[#292]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/292
[#293]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/293
[#294]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/294
[#295]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/295
[#296]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/296
[#297]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/297
[#298]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/298
[#299]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/299
[#300]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/300
[#301]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/301
[#302]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/302
[#303]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/303
[#304]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/304
[#305]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/305
[#306]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/306
[#307]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/307
[#308]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/308
[#309]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/309
[#310]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/310
[#311]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/311
[#313]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/313
[#314]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/314
[#315]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/315
[#316]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/316
[#317]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/317
[#318]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/318
[#319]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/319
[#320]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/320
[#323]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/323
[#324]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/324
[#325]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/325
[#326]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/326
[#327]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/327
[#328]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/328
[#329]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/329
[#330]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/330
[#331]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/331
[#332]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/332
[#333]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/333
[#334]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/334
[#335]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/335
[#336]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/336
[#337]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/337
[#338]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/338
[#339]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/339
[#340]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/340
[#341]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/341
[#342]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/342
[#343]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/343
[#344]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/344
[#345]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/345
[#346]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/346
[#347]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/347
[#348]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/348
[#349]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/349
[#350]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/350
[#351]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/351
[#352]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/352
[#353]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/353
[#354]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/354
[#355]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/355
[#356]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/356
[#357]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/357
[#358]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/358
[#359]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/359
[#360]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/360
[#361]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/361
[#362]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/362
[#363]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/363
[#364]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/364
[#365]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/365
[#366]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/366
[#367]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/367
[#368]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/368
[#369]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/369
[#370]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/370
[#371]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/371
[#372]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/372
[#373]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/373
[#374]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/374
[#375]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/375
[#376]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/376
[#377]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/377
[#379]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/379
[#380]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/380
[#381]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/381
[#382]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/382
[#383]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/383
[#384]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/384
[#385]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/385
[#386]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/386
[#387]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/387
[#388]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/388
[#389]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/389
[#390]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/390
[#391]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/391
[#392]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/392
[#393]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/393
[#394]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/394
[#395]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/395
[#396]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/396
[#397]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/397
[#398]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/398
[#399]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/399
[#400]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/400
[#401]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/401
[#402]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/402
[#403]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/403
[#404]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/404
[#405]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/405
[#406]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/406
[#407]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/407
[#408]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/408
[#409]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/409
[#410]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/410
[#411]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/411
[#412]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/412
[#413]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/413
[#414]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/414
[#415]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/415
[#416]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/416
[#417]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/417
[#418]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/418
[#419]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/419
[#420]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/420
[#421]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/421
[#422]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/422
[#423]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/423
[#424]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/424
[#425]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/425
[#426]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/426
[#427]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/427
[#428]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/428
[#429]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/429
[#430]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/430
[#431]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/431
[#432]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/432
[#433]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/433
[#434]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/434
[#435]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/435
[#436]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/436
[#437]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/437
[#438]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/438
[#439]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/439
[#440]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/440
[#441]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/441
[#442]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/442
[#443]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/443
[#444]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/444
[#446]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/446
[#447]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/447
[#448]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/448
[#449]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/449
[#450]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/450
[#451]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/451
[#452]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/452
[#453]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/453
[#454]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/454
[#455]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/455
[#456]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/456
[#457]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/457
[#458]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/458
[#459]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/459
[#460]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/460
[#461]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/461
[#462]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/462
[#463]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/463
[#464]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/464
[#465]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/465
[#466]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/466
[#467]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/467
[#468]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/468
[#469]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/469
[#470]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/470
[#471]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/471
[#472]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/472
[#473]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/473
[#474]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/474
[#475]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/475
[#476]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/476
[#477]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/477
[#478]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/478
[#479]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/479
[#480]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/480
[#481]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/481
[#482]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/482
[#483]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/483
[#484]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/484
[#485]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/485
[#486]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/486
[#487]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/487
[#488]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/488
[#489]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/489
[#490]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/490
[#491]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/491
[#492]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/492
[#493]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/493
[#494]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/494
[#495]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/495
[#496]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/496
[#497]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/497
[#498]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/498
[#499]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/499
[#500]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/500
[#501]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/501
[#502]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/502
[#503]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/503
[#504]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/504
[#505]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/505
[#506]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/506
[#507]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/507
[#508]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/508
[#509]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/509
[#510]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/510
[#511]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/511
[#512]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/512
[#513]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/513
[#514]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/514
[#515]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/515
[#516]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/516
[#517]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/517
[#518]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/518
[#519]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/519
[#520]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/520
[#521]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/521
[#522]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/522
[#523]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/523
[#524]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/524
[#525]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/525
[#526]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/526
[#527]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/527
[#528]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/528
[#529]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/529
[#530]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/530
[#531]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/531
[#532]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/532
[#533]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/533
[#534]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/534
[#535]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/535
[#536]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/536
[#537]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/537
[#538]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/538
[#539]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/539
[#541]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/541
[#542]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/542
[#543]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/543
[#544]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/544
[#547]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/547
[#548]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/548
[#549]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/549
[#550]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/550
[#551]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/551
[#552]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/552
[#553]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/553
[#554]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/554
[#555]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/555
[#556]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/556
[#557]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/557
[#558]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/558
[#559]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/559
[#560]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/560
[#561]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/561
[#562]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/562
[#563]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/563
[#564]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/564
[#565]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/565
[#566]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/566
[#567]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/567
[#568]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/568
[#569]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/569
[#571]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/571
[#572]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/572
[#573]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/573
[#574]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/574
[#575]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/575
[#576]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/576
[#578]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/578
[#581]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/581
[#582]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/582
[#583]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/583
[#584]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/584
[#585]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/585
[#587]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/587
[#588]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/588
[#589]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/589
[#590]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/590
[#591]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/591
[#592]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/592
[#593]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/593
[#594]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/594
[#595]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/595
[#596]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/596
[#597]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/597
[#598]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/598
[#599]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/599
[#600]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/600
[#601]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/601
[#602]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/602
[#603]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/603
[#604]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/604
[#605]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/605
[#606]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/606
[#607]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/607
[#608]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/608
[#609]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/609
[#610]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/610
[#611]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/611
[#612]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/612
[#613]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/613
[#614]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/614
[#615]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/615
[#616]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/616
[#617]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/617
[#618]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/618
[#619]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/619
[#620]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/620
[#621]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/621
[#622]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/622
[#623]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/623
[#624]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/624
[#625]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/625
[#626]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/626
[#627]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/627
[#628]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/628
[#629]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/629
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
[#900]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/900
[#901]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/901
[#902]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/902
[#903]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/903
[#904]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/904
[#905]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/905
[#906]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/906
[#907]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/907
[#908]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/908
[#909]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/909
[#910]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/910
[#911]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/911
[#912]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/912
[#913]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/913
[#914]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/914
[#915]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/915
[#916]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/916
[#917]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/917
[#918]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/918
[#919]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/919
[#920]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/920
[#921]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/921
[#922]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/922
[#923]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/923
[#924]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/924
[#925]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/925
[#926]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/926
[#927]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/927
[#928]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/928
[#929]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/929
[#930]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/930
[#931]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/931
[#932]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/932
[#933]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/933
[#934]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/934
[#935]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/935
[#936]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/936
[#937]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/937
[#938]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/938
[#941]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/941
[#945]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/945
[#946]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/946
[#947]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/947
[#948]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/948
[#949]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/949
[#950]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/950
[#951]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/951
[#952]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/952
[#953]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/953
[#954]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/954
[#955]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/955
[#956]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/956
[#957]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/957
[#958]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/958
[#959]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/959
[#960]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/960
[#961]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/961
[#962]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/962
[#963]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/963
[#964]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/964
[#965]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/965
[#966]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/966
[#967]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/967
[#968]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/968
[#970]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/970
[#971]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/971
[#972]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/972
[#973]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/973
[#974]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/974
[#975]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/975
[#976]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/976
[#977]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/977
[#978]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/978
[#979]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/979
[#980]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/980
[#981]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/981
[#982]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/982
[#983]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/983
[#984]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/984
[#985]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/985
[#986]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/986
[#987]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/987
[#988]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/988
[#989]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/989
[#990]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/990
[#991]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/991
[#992]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/992
[#993]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/993
[#994]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/994
[#995]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/995
