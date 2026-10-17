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
