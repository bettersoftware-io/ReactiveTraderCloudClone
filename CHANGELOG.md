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

Every merged PR is cited. Before 2026-W27 most work reached `main` as direct
commits rather than PRs; those weeks are shorter, cite their key commits,
and end with a link to the week's full commit list. The newest week is first. This file says
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

## 2026-W26 — 22 Jun – 28 Jun

The HUD redesign began: a futuristic prototype was committed as the design
reference, specced in seven phases, and its first three phases landed. Around
it the repo grew a wall of blocking static-analysis gates, the clone's
behaviour was synced to the original's, a first cloud deploy was wired up, and
changes started shipping as PRs.

### Added

- **HUD redesign, first three stages.** Skin × mode theming, Motion One behind a
  wrapper and an animation-intent seam, with the app defaulting to the `holo`
  skin ([`9f11e10a3`]); an in-house layout engine behind a `LayoutPort` —
  resizable splits, maximise, collapse, a pinned blotter ([#32]); the shell
  chrome — boot sequence, lock screen, header, status bar and preferences
  modal ([#35]), with the boot splash and a LOCK SESSION control then mounted
  in the live app ([#38]).
- **Behaviour synced to the original ReactiveTraderCloud** — 13 behaviours,
  each golden-fixtured or cited to the original's source, among them the
  blotter's sort order and 3× new-row flash, USD P&L formatting, per-currency
  position bubbles, credit blotter sort/filter/CSV, live `quoteRejected`,
  server-driven RFQ expiry, a 100M quantity cap, Buy/Sell disabled on a stale
  tile, and an idle timeout that closes the socket. [`b7ff4cf58`] A follow-up
  gave the idle overlay a Reconnect button. [`299f210cc`]
- **Cloud deploy** — the React client on Vercel behind a password gate, the WS
  server on Fly.io behind an access token; setup in
  [`docs/DEPLOY.md`](docs/DEPLOY.md). [`25e4fcdb9`] [`1159f8456`]
- **On-demand coverage report** — a `workflow_dispatch` job summary, readable
  on a phone, of test results and per-file untested lines ([`5f64284de`]
  [`a7ce2efdd`]), then whole files rendered as coloured diffs in five
  per-tier sections ([#34]).

### Changed

- **Seven blocking static-analysis gates**, each at zero findings: actionlint,
  manypkg + syncpack, knip, dependency-cruiser, an ESLint AST tier (1,901
  findings swept) and a type-aware tier (24 real async and exhaustiveness bugs
  fixed) ([`9ba180f4d`]), then stylelint for only what Biome cannot check
  ([`cd88d0b1d`]). The type-aware tier now covers every file through one
  umbrella program — it had silently skipped tests, configs and contract specs
  ([`e37be8283`]) — the contract specs lost their ESLint exclusion ([#31]), and
  chained `useHooks().useX()` calls are banned ([`e67b4695a`]).
- **Stricter Biome:** four more rules, all six rule domains declared (an
  undeclared domain leaves its rules silently inert), grouped import sorting,
  and bans on default exports, implicit types and inline object types.
  [`f42da63cb`] [`918867647`] [`5787ca2a0`] [`c74397dfe`] [`fb164244a`]
  [`86a5e9e2b`]
- **`#/` alias imports** replace relative imports two or more levels up, which
  are now a lint error. [`f212a4d65`]
- **React Compiler adopted** and every manual `useMemo`/`useCallback` removed;
  its lint half surfaced two render-purity bugs, both fixed. [`ce5dd5231`]

### Fixed

- CI back to green after the behaviour-sync work — ESLint violations and the
  x86 visual goldens ([#29] [`ab26b5795`]) — and a lock-screen golden
  refreshed after the boot splash changed its component bundle ([#40]).
- An RFQ countdown test flaked on the wall clock; `Date.now` is now frozen.
  [`1edf3227c`]

### Decisions

- **Layout management is a swappable port**, Dockview or an in-house engine
  behind it — [ADR-002](docs/adr/ADR-002-layout-management-port.md), with the
  library survey in a
  [research note](docs/research/2026-06-22-layout-management-landscape.md).
- **React Compiler over manual memoisation** —
  [ADR-003](docs/adr/ADR-003-react-compiler-and-manual-memoization.md).
- **Biome owns formatting; ESLint runs only rules that do not overlap it**,
  locally and in CI — [`docs/tooling-roadmap.md`](docs/tooling-roadmap.md) and
  the [adoption design](docs/superpowers/specs/2026-06-22-dev-tooling-adoption-design.md).
- **The layout engine was reverted, then relanded as a PR** — its direct merge
  broke two CI checks no local run covered. [`924e4c1b8`] [#32] Changes now ship
  through a worktree, a PR and a merge commit (the `shipping-repo-changes`
  skill, [#37]), with worktree cleanup as its fifth rule ([#39]).
- **Deploys are on demand only** while one-time setup is pending. [`ff6f4c234`]
- **Idle recovery is button-only** ([`299f210cc`]); credit-limit handling stays
  faithful to the original web build by design ([`b7ff4cf58`]).

### Under the hood

- **Design:** the HUD prototype committed as a living reference
  ([`5482ffb64`]), its v2 added ([#33]) and the original moved beside it as
  `v1/` ([#36]); the HUD design spec and its phase plans ([`a98cabece`]).
- **Tests:** SetFilter and CurrencyFilter covered by interaction-driven visual
  scenarios ([#30]); the provider guards and a sort arm covered in the
  contract tier ([`7b2230a93`]); the darwin-arm64 goldens regenerated
  ([`9462bba22`]); `@rtc/domain`'s coverage no longer counts JSON fixtures as
  source ([`2f0b319de`]).
- **Docs:** dependency-cruiser's rules explained with a diagram
  ([`fe3b3fdd3`]); a
  [retrospective](docs/research/2026-06-23-spec-driven-reimplementation-fidelity.md)
  on spec-driven reimplementation fidelity ([`9e091d667`]).
- **Dependencies:** `@types/node` 26 to match the runtime ([`cf18ecf5e`]),
  Cypress 15.17 ([#23]) and pnpm 11.8 ([#21]).

Every commit: [`2026-W25...2026-W26`](https://github.com/bettersoftware-io/ReactiveTraderCloudClone/compare/2026-W25...2026-W26).

## 2026-W25 — 15 Jun – 21 Jun

The React components went "dumb" — their logic moved into RxJS machines — and
the visual tier filled in the render states that made reachable. The week
ended with three repo-wide moves: `packages/client` became
`packages/client-react`, inline styles became CSS Modules, and Biome arrived.

### Changed

- **Dumb UI.** Timer, transport, persistence and orchestration logic moved
  into RxJS machines behind a `useMachine` bridge, with new `AdminPort` and
  `PreferencesPort` ports; throughput travels over the WebSocket only. A gate
  keeps `src/ui` free of `rxjs`, `localStorage`, `fetch` and timers.
  [`044b06b1a`] [`8c860e857`] Design: [the Dumb-UI
  spec](docs/superpowers/specs/2026-06-16-dumb-ui-rxjs-machines-design.md).
- **`packages/client` renamed to `packages/client-react`**, preparing for
  further UI layers. [`186255e4a`]
- **Inline styles → CSS Modules** across the React client, with state carried
  by semantic `data-*` attributes and the visual goldens as the unchanged
  oracle. [`5cd7690e7`] [`6bff8ce08`] [`ff52402a1`]
- **Biome 2.5 formatter + linter** — the repo reformatted, its findings fixed
  (all 143 non-null assertions rewritten as guards), and a blocking CI step.
  [`95798bdc8`] [`1e5740c40`] [`7230a4ebb`]
- **Node 26** in CI, with `.nvmrc` as the source of truth.
  [`d44e94cf9`] [`0c918415a`]

### Fixed

- **Four icon glyphs showed as literal `\uXXXX` text** — a bare escape in JSX
  text is not interpreted. [`7eb630074`]
- jsdom tests pass on Node 26, whose native `localStorage` shadowed jsdom's
  ([`d44e94cf9`]); `test:e2e` uses whatever port Vite binds and always stops its
  dev server ([`a9f59af4c`]); the visual runners run serially outside CI
  ([`5d40f3256`]); tsc's build info lives inside `dist/` so it cannot leave an
  empty one behind ([`1db68b3ee`]).

### Decisions

- **Guards, never `?.`, for non-null assertions** — an optional chain would
  swallow the error. [`1e5740c40`]
- **Standardise up to Node 26 rather than pin down.** [`d44e94cf9`]
- **Drop the `form-data` override, keep `uuid@11`** (proven
  required). [`065d70a84`]

### Under the hood

- **Coverage to its behavioural ceiling** — behaviour-only tests and new visual
  scenarios across domain, server and client, plus batches of goldens for
  missing render states; test-support files no longer count as source.
  [`65f02b6a6`] [`dee3fb627`] [`293e0e2d9`] [`b15280013`]
- **Goldens and scripts:** a darwin-arm64 golden set for macOS runs
  ([`95a0d1b40`]); root `test:coverage`, `test:ui:coverage` and
  `test:e2e:no-cypress` ([`b0ce6af61`] [`f05650e44`] [`3394f4496`]).
- **Docs:** [`tests/STRATEGY.md`](tests/STRATEGY.md) for the e2e tier, the
  three visual runners explained, and
  [`docs/claude-sandbox.md`](docs/claude-sandbox.md) for the Linux dev
  container. [`464cef75d`] [`27142a3d7`] [`33744d5a8`]
- **Dependencies:** `undici` 7.28 and a `uuid` override for Dependabot alerts
  ([`d38c7e2a7`] [`57a6f6dd3`]), the Playwright container synced to 1.61
  ([`471c6ba2e`]), and Renovate ([#17] [#18] [#19] [#20]).

Every commit: [`2026-W24...2026-W25`](https://github.com/bettersoftware-io/ReactiveTraderCloudClone/compare/2026-W24...2026-W25).

## 2026-W24 — 8 Jun – 14 Jun

A testing week. The web client (`@rtc/client`, now `@rtc/client-react`) gained
a framework-neutral contract tier held to a 95% coverage gate in CI, the visual
tier moved beside it under `tests/ui/`, and the server's wire protocol got
contract tests of its own.

### Added

- **The `ui:contract` test tier** — sociable Testing Library specs over `src/ui`
  that talk only to neutral page objects and a harness, so they should survive a
  swap of UI framework. It started as a "behaviour" tier over four components
  ([`3ff2934a7`]), gained v8 coverage ([`247dac6c0`]), was renamed `ui:contract`
  with a focused `test:app` runner beside it, and now covers `src/ui` behind a
  CI-enforced 95% gate ([`ff3341e6b`]).
- **Server wire-protocol contract tests** for all 16 client message types,
  checking emitted frames against the shared fixtures; `wsHandler.ts` line
  coverage went from about 30% to about 90%. [`f29f1b8ea`]
- **Report-only coverage** for domain, server and the client app tier, plus an
  istanbul gap-finder over the Vitest browser-mode visual tier, with a one-time
  inventory of gaps. No gates. [`11cab0d72`]
- **`:headed` variants for every browser suite** ([`cc75c3e83`]) and a `:ui`
  variant (Playwright UI mode) for the native Playwright suite ([`a0763f9a1`]).
  Neither enters `test:e2e` or CI.

### Changed

- **The visual tier moved to `tests/ui/visual`** and its scripts were renamed
  `test:visual-diff:*` → `test:ui:visual:*`, along with the report path, import
  alias, tsconfig and Turbo task. The 102 goldens moved byte-for-byte. [#16]
  ([spec](docs/superpowers/specs/2026-06-13-ui-visual-taxonomy-design.md))
- **HTML reports for the visual tier** under `reports/visual-diff/`, and CI's
  failure uploads collapsed onto `reports/` plus the golden-diff globs.
  [`e95c5d0a1`] [`4e090869f`]

### Fixed

- **Vitest browser-mode failure screenshots now land next to their golden**, so
  the gitignore and CI upload globs match them; before this they went into
  `.vitest-attachments/` and were never uploaded. [`e95c5d0a1`]
- The playwright-cucumber `:headed` run opens one browser window instead of two.
  [`b0ec85c01`]
- `clean` removes the leftover generated files (`.vitest-attachments`, the
  Playwright CT host cache). [`c467afc2b`] [`79a6865ef`]

### Decisions

- **Cypress is CI-verified only for now.** Every Cypress suite hangs in the
  arm64 dev container (Electron crashes on boot); the theories ruled out and the
  interim rule, Playwright for local runs, are in
  [`tests/README.md`](tests/README.md). [`a187b7680`]
- **No `:ui` variant for the cucumber suites** — UI mode needs the native
  Playwright runner to list the tests. [`a0763f9a1`]

### Under the hood

- **Docs:** one map of every report location, coverage included, across the
  READMEs. [`211304d2a`]
- **Dependencies:** esbuild 0.28.1, which patches two advisories ([#12],
  [`409e01266`]); pnpm 11.6.0 ([#15], [`6171b8178`]); `@types/node` ([#13],
  [`5e465a9c3`]) and turbo ([#14], [`0fbb3c0fd`]) patches.

Every commit: [`2026-W23...2026-W24`](https://github.com/bettersoftware-io/ReactiveTraderCloudClone/compare/2026-W23...2026-W24).

## 2026-W23 — 1 Jun – 7 Jun

The repo went onto GitHub's machinery. The first CI workflow, the first merged
pull requests (Renovate's, then two CI fixes) and the supply-chain defaults all
landed on 7 June, in step with a toolchain upgrade. Alongside that came a
screenshot-based visual test tier and a suite-first layout for the e2e tests.

### Added

- **A visual-diff test tier** for the web client: screenshots of components and
  pages rendered against injected fake hooks, built on a React-free shared core
  of fixtures, scenarios and goldens ([`bbf28e4b8`]). It was extended to Credit,
  Admin, a populated FX blotter and the light theme ([`b8ebdd5ac`]), and split
  into Playwright CT and plain-Playwright runners ([`184f94c03`]). A third
  runner on Vitest browser mode followed once Vitest 4 had landed ([`e63544053`]
  [`e8a7c9140`]).
- **Per-arch local goldens** — a local run reads its own committed
  `react-local/<platform>-<arch>/` set, so `test:visual` can pass on Apple
  Silicon. [`371355280`] [`1e22c3eb8`]
- **HTML reports for every test script**, at a path that mirrors the script's
  name, with failure screenshots embedded where the runner allows it.
  [`d1f76843f`] [`9420ed32b`] [`81f29800e`] [`dbe59f499`]

### Changed

- **First CI.** A GitHub Actions workflow with `checks` (typecheck, tests,
  build, gates) and `visual` jobs ([`4e13abd94`]), then a full e2e job, actions
  pinned to SHAs, and Renovate ([`5c1585dc9`]). The visual job now runs inside
  the Playwright container its goldens are made in, a dispatch-only workflow
  regenerates them ([`831df5b55`]), and e2e concurrency is capped on the 2-vCPU
  runner. [#8]
- **Toolchain upgrade:** Vite 8, Vitest 4, plugin-react 6, jsdom 29
  ([`2a394a565`]); TypeScript 6.0.3 ([`5f3587787`]); cucumber 13 and
  fake-timers 15 ([`23dd79093`]); Playwright 1.60 ([`9ad591129`]); pnpm 11.5.2,
  which brings a 24-hour release cooldown and an install-script allowlist
  ([`271734057`]).
- **The e2e tests use a suite-first layout** under `tests/browser/` and
  `tests/presenter/`: a bare name is the default variant, and a suffix such as
  `-cucumber` or `-fake-timers` names the deviation. [`02ec08e88`]
  [`7122fac57`] [`60a9c73b8`] The visual tier moved to
  `packages/client/tests/visual-diff/` the same way. [`47df586c9`]

### Fixed

- **CI's first red runs:** workspace libraries are now built before the visual
  and e2e jobs ([`d56cd4e88`]), and the Cypress suites get a 30 s command
  timeout and retries on CI after a connection-settle flake. [#9]
- **Security advisories:** a ws denial-of-service fix via override, with a
  production `pnpm audit` gate and security-only Dependabot ([`3959c12dd`]); a
  high-severity `serialize-javascript` RCE in a dev-only chain, fixed by
  override ([`e60b15480`]).

### Decisions

- **Playwright CT for the visual tier, and the committed goldens, not the
  runner, are the cross-framework contract.** See
  [ADR-001](docs/adr/ADR-001-visual-diff-tooling.md). [`f0afd2d77`] The
  Vitest browser runner was dropped from the first harness and recorded as a
  comparison finding ([`184f94c03`]), then built once Vitest 4 removed its
  blockers ([`e63544053`]).
- **CI's x86 `react/` goldens stay canonical**; the per-arch local sets are for
  feedback only. [`371355280`]
- **Renovate owns routine bumps; Dependabot stays security-only**, so the two
  never open the same PR. [`5c1585dc9`]
- **The ws security override is not Renovate's to change.** Its ws@8 PR ([#6])
  pushed a transitive dependency onto a major it does not declare, so the
  override was restored and Renovate told to leave it alone. [`481a045a4`]

### Under the hood

- **Docs:** READMEs for the test suites and the client ([`0281b2a4e`]
  [`975d8d089`] [`b12dd95c4`]), how turbo caching works and how to force a
  fresh run ([`05ad81589`]), and the plans for the test restructure and the
  report wiring.
- **Dependencies:** a patch/minor sweep including Cypress 15.16 ([`c699d7136`]),
  vitest-browser-react 2.2 ([`b59bf3d97`]), and Renovate's first wave of action
  majors and ws ([#2] [#3] [#5] [#6] [#7]).

Every commit: [`2026-W22...2026-W23`](https://github.com/bettersoftware-io/ReactiveTraderCloudClone/compare/2026-W22...2026-W23).

## 2026-W22 — 25 May – 31 May

The backend got tested for the first time, and the e2e suite went parallel —
which flushed out a string of test-harness isolation bugs. The connection
status also gained its long-described reconnecting transition.

### Added

- **Reconnecting connection state** — `WsAdapter` emits `reconnectAttempt`
  when its retry timer fires (DISCONNECTED → CONNECTING), with
  `docs/architecture.md` realigned to the code ([`ef5779556`]); a matching
  scenario runs in all four presenter peers ([`ce10e73b2`] [`176bbef09`]).
- **Backend coverage** — protocol tests drive the real connection handler
  through a fake socket, and two full-stack smokes boot the real server, one
  from Node and one with a Vite client rendering its prices. [`db91e8139`]

### Changed

- **The e2e suite runs in parallel**, each browser suite on its own port:
  ~408 s → ~114 s ([`da429c3ee`]). Each Cypress suite now gets its own X
  display ([`b814bee85`]) and dev servers die by process group, so Vite no
  longer survives teardown holding its port ([`3be2c8d50`]).
- **Runner scripts renamed** — `test:browser:*` for the UI against in-process
  simulators, `test:fullstack:*` for the real backend ([`e45f6af27`]);
  `pnpm clean` removes every artifact, `clean:deep` also `node_modules`
  ([`936e5c043`]).

### Fixed

- **`WsAdapter` dropped messages sent before the socket opened** — a latent
  production race; they are now buffered and flushed on open. [`f72777fce`]
- **A false-passing blotter assertion** under Cucumber + Cypress leaked its
  failure into the next scenario; it now retries inside the command queue.
  [`f45ed106b`]
- **Harness:** the dev-server guard refuses a server it did not start
  ([`42db5ba98`]), with a cross-platform `port:free` helper ([`198433eae`]);
  the presenter-only scenario is cleanly excluded from the browser peers
  ([`17e52efc9`]).

### Decisions

- **`test:e2e` is never cached by Turbo** — a cached "pass" replays without
  running anything, and had already hidden real failures. [`fa866dcf4`]

### Under the hood

- **README** rewritten as a full project page ([`22b39d629`]) and updated for
  the parallel run ([`0cdd152d5`]).

Every commit: [`2026-W21...2026-W22`](https://github.com/bettersoftware-io/ReactiveTraderCloudClone/compare/2026-W21...2026-W22).

## 2026-W21 — 18 May – 24 May

A testing week. A fourth presenter-level peer ran the shared scenarios in
plain Vitest, every transport port got a contract suite run against both its
simulator and its WebSocket adapter, and the synthetic "gateway connected"
event gave way to real connection events.

### Added

- **A fourth presenter peer in plain Vitest** — the 19 `@presenter` scenarios
  as `describe`/`it` blocks, no Gherkin loader ([`c78b93d68`] [`de0ef3906`]),
  held to the `.feature` files by count-parity and naming gates ([`077386d69`]
  [`df91926bc`]).
- **Contract tests for all eight transport ports** — one describer per port in
  `@rtc/domain`, run against the simulator and the WebSocket adapter (through
  an in-memory `FakeWsAdapter`) alike ([`c7c990da3`] [`473771631`]
  [`242a26147`]); nack paths tested on the WebSocket side only
  ([`ce15ba3da`]); a gate keeps describers free of implementation imports
  ([`79b948676`]).

### Changed

- **Real gateway connection events** — `WsAdapter` emits them from the socket
  lifecycle, simulator mode has a `ConnectionEventsSimulator`, and
  `withSyntheticGatewayConnected` is gone ([`1e16bbc85`] [`ff6ba31f9`]). A
  server down at boot now reads DISCONNECTED, not CONNECTING forever
  ([`45fe824ca`]). The reconnect delay is configurable ([`a92037ae9`]).

### Fixed

- **Simulator mode stuck at CONNECTING** after coming back online
  ([`70e8e01f1`]) or after idle recovery ([`60a38e059`]).
- A vacuously true analytics ordering invariant now actually runs
  ([`d88be7271`]); a `WsAdapter` test no longer leaks a real timer
  ([`211a09130`]).

### Decisions

- **Port contracts cover the happy path only, against a fake WebSocket** —
  [design](docs/superpowers/specs/2026-05-18-phase-5c-port-contract-tests-design.md)
  ([`af41e0b82`]).
- **Gateway events come from a per-mode adapter** merged at the composition
  root — [design](docs/superpowers/specs/2026-05-19-phase-5d-real-gateway-events-design.md)
  ([`19b43eff1`]).
- **Deferred to their own design rounds:** the connection lifecycle refactor,
  a stronger workflow-port contract, and de-duplicating the presenter step
  trees — [cleanup spec](docs/superpowers/specs/2026-05-19-phase-5e-cleanup-design.md)
  ([`6d8656529`]).

### Under the hood

- **Cleanup sweep** — an `awaitPendingRpc` helper with an iteration cap
  ([`dc142908d`]), a barrel-completeness gate ([`a3b955a80`]), an
  `IWsAdapter` interface ([`769a47b00`]), dead fields and factories pruned
  ([`b41e5e53e`] [`3aff596ed`]), test idioms and step names tidied.
- **Docs:** `docs/architecture.md` gains the contract-test layer, the full
  list of 23 gates and the gateway adapter pair ([`23db8c77a`] [`d365ca81b`]).

Every commit: [`2026-W20...2026-W21`](https://github.com/bettersoftware-io/ReactiveTraderCloudClone/compare/2026-W20...2026-W21).

## 2026-W20 — 11 May – 17 May

The test-stack comparison grew from three peers to seven: one set of Gherkin
scenarios, run by more and more stacks. Raw Cypress reached parity only after
its test-body shape had been fought out, and a new family of browser-less
"presenter" peers bound the same `.feature` files straight to the RxJS
presenters, first in real time and then under fake timers.

### Added

- **Raw Cypress, the fourth e2e peer.** All 40 Cucumber scenarios as plain
  Cypress specs, built on a forked, synchronous scenarios layer that drives the
  Cypress command queue directly. `pnpm test:e2e` runs it after the other three,
  with exit codes OR-ed so every failure shows. ([`1c56bdb1e`], [`46e3a29a5`],
  [`5f89424a0`])
- **Presenter-direct peer (the fifth).** The `.feature` files bound to the
  RxJS presenters with no browser: 19 scenarios tagged `@presenter`, part
  existing and part new business-behaviour ones (notional on executed trades,
  deterministic rejections, blotter accumulation, RFQ). The new scenarios run on
  the four browser peers too, taking the feature set from 40 to 48 scenarios.
  `@rtc/client` gained a package API and emits `.d.ts` for the tests workspace.
  ([`eecc786ed`], [`778386298`], [`d447f6f6f`], [`6a60fa8e5`])
- **Fake-timer presenter peers.** The same 19 scenarios under Cucumber with
  `@sinonjs/fake-timers` (about 1 s against ~18.6 s in real time), then under
  Vitest with the `quickpickle` Gherkin plugin and `vi.useFakeTimers` (~2 s).
  Shared presenter scenarios moved to a runner-neutral `_shared/` folder.
  ([`112e02d47`], [`49d9d9696`], [`9c3bfc273`], [`ff5f67ae1`])

### Fixed

- **The RFQ scenario** needed an explicit "Initiate RFQ" step on the browser
  peers (setting a notional alone starts no countdown), and the presenter
  request now uses the pair's `pipsPosition`, as production does. ([`2178563be`],
  [`1012197b7`])
- **"Prices update"** re-reads the live price stream instead of checking a
  snapshot taken two steps earlier. ([`ece0d656c`])
- **Currency pairs arrive after a simulated 1 s delay**, not on subscribe, so
  a bare read deadlocks under fake timers; those reads now go through the
  World's timed await. ([`0f85701c5`])

### Decisions

- **Raw Cypress gets its own scenarios layer.** Four combinations of test-body
  shape and page-object implementation failed, because the shared scenarios are
  Promise-shaped and Cypress is queue-native. A native-Promise page-object
  rewrite was applied, reverted, re-applied and reverted again (no net change).
  The reasoning is §3.1–§3.3 of the
  [raw Cypress spec](docs/superpowers/specs/2026-05-11-phase-5a-4-raw-cypress-po-contracts-design.md).
  ([`0609ad812`], [`6a99871bc`], [`93a9eece1`], [`8047ce1de`])
- **Real- and fake-time presenter runners share scenarios and steps** through
  an `AwaitHelpers` interface on the World, overriding the earlier "mirror,
  don't share" guidance —
  [fake-timers spec](docs/superpowers/specs/2026-05-17-phase-5b-2-cucumber-fake-timers-design.md).
  ([`1665b6744`])

### Under the hood

- **Grep gates 9–19** pin what a test body may touch: driver imports,
  `ctx.po.*` and `page.*` / `cy.*` calls stay in the fixture files (raw
  Playwright, raw Cypress); presenter tests import no browser driver, touch no
  DOM and build the app in one place; no rxjs `timeout` in shared presenter
  scenarios (it deadlocks under fake timers); no Vitest imports outside the
  Vitest peer. ([`55a5fe702`], [`936408f97`],
  [`3caa5b3d8`], [`47c43df0b`], [`cf753765e`])
- **Docs:** `docs/architecture.md` §9.5 followed the stack from three runners to
  seven ([`cf7700ee0`], [`2b99843df`], [`d4617c6c7`]); a design spec and plan
  per peer, including a Vitest-without-Gherkin peer designed but not yet built
  ([`e27242f16`]); STATUS rows and follow-ups as each peer closed.

Every commit: [`2026-W19...2026-W20`](https://github.com/bettersoftware-io/ReactiveTraderCloudClone/compare/2026-W19...2026-W20).

## 2026-W19 — 4 May – 10 May

The client got a real composition root: presenters over the domain's use
cases, bound to React through react-rxjs, then split into a React-free `app/`
layer and a `ui/` layer grouped by trading domain. The second half of the week
rebuilt e2e: one set of Gherkin features behind driver-free page objects, run
by Cucumber + Playwright, Cucumber + Cypress and raw Playwright.

### Added

- **Presenters and a composition root.** Five new use cases, a
  `ConnectionEventsPort` with its status use case, a
  `BrowserConnectionEventsAdapter` (activity, online/offline, idle timer), and
  eleven presenters exposing shared Observables; `createApp()` builds the tree
  and `HooksProvider` binds it via `@react-rxjs/core`
  ([`256750262`], [`fda1be966`], [`1293b0386`], [`838765a38`], [`c4d74abf5`]).
- **A `tests/` workspace with Gherkin and page objects.** The eight Playwright
  specs became `.feature` files run by Cucumber-JS, backed by driver-free
  page-object contracts and one source for every `data-testid`; the old
  `packages/client/e2e` was deleted ([`49e576405`], [`600f65e10`],
  [`3a14022d3`]).
- **Two more e2e runners on the same 40 scenarios.** Cucumber + Cypress shares
  the step tree through a bundler alias and reaches 40/40 ([`81487c2b1`],
  [`7969e724f`]); a raw `@playwright/test` suite reuses the page objects
  through a fixture ([`f26ae7243`], [`4716841e8`]). `pnpm test:e2e` runs all
  three against one dev server ([`761be50cc`]).

### Changed

- **The domain's boundary is Observable throughout** — the credit RFQ workflow
  port migrated and the `delay` helper deleted, closing that phase
  ([`7cf0d1e03`], [`285e19e0c`]). The RFQ quote's artificial delay moved from
  the hook into the simulator ([`a2dc789a3`]).
- **UI consumes only `useHooks()`.** FX, credit, blotter and analytics
  migrated off the pass-through hooks, and `ServiceProvider` and
  `ConnectionProvider` were retired ([`a27fb4058`], [`87645a1f0`],
  [`b5c94453b`]); `createApp()` no longer imports React ([`3434bd7dd`]).
- **`packages/client` (today's `client-react`) split into `app/` and `ui/`**
  — the react-rxjs bridge moved out of `app/`, and the React files regrouped
  under `ui/fx`, `ui/credit`, `ui/admin` and `ui/shell` ([`8ab1e64a4`],
  [`da50337a5`], [`e25e952cd`]).

### Fixed

- After the browser comes back online the connection reaches CONNECTED, not
  just CONNECTING. [`b5c94453b`]
- The e2e dev server binds to `127.0.0.1`, so the harness reaches it on hosts
  where `localhost` resolves to IPv6 ([`ad481397b`]); stopping it waits for
  the process to exit ([`e55a695a9`]).

### Decisions

- **Presenters and a react-rxjs bridge, with the boundary type now
  Observable** — `docs/superpowers/specs/2026-05-01-phase-3-presenters-react-rxjs-design.md`,
  amended in [`1da239b26`].
- **A React-free `app/` beside a `ui/` grouped by trading domain** —
  `docs/superpowers/specs/2026-05-07-phase-4-app-ui-reorg-design.md` ([`3aaf3cd61`]).
- **One behaviour spec, many drivers** — features and page-object contracts as
  the single sources of truth, with seams for Cypress and raw runners
  ([`53e6a9c4e`], [`a1cb6739c`], [`94db1671c`]).
- **Cypress goes offline by dispatching DOM events, not through CDP**, whose
  promises resolve outside Cypress's command queue. [`7969e724f`]

### Under the hood

- **E2e gates and scripts:** eight grep gates for the test stack's invariants
  ([`22281ad68`]) and umbrella scripts that share one dev server across
  runners ([`a6d8ba1b1`]).
- **Docs:** implementation plans for each phase, `docs/architecture.md`
  updated for the new layout and the dual-runner stack ([`05ecee4bf`]), and
  STATUS kept current.
- Claude Code settings split into a shared, committed allow-list and a
  git-ignored per-machine file. [`6cc48140a`]

Every commit: [`2026-W18...2026-W19`](https://github.com/bettersoftware-io/ReactiveTraderCloudClone/compare/2026-W18...2026-W19).

## 2026-W18 — 27 Apr – 3 May

Work resumed after a three-week gap with an architecture document, and the
week went into bringing the code in line with it: mocks became simulators,
business logic left the React hooks for domain use cases, every file got a
camelCase or PascalCase name, and the domain ports began moving from
`AsyncIterable`/`Promise` to RxJS `Observable`. No feature changed.

### Added

- **[`docs/architecture.md`](docs/architecture.md)** — written, then revised
  around the Dependency Rule and "defer commitment": explicit use-case and
  presenter tiers, a replaceability matrix and a layered test strategy, with
  the gaps between the code and the target flagged. [`b9aa66807`]
  [`71ebb4d43`]
- **Domain use cases** extracted from the React hooks — price stream, price
  history, trade execution, analytics, RFQ creation, and the RFQ event fold as
  a pure reducer — each hook keeping its signature and delegating.
  [`6cebdc53d`] [`498a0226c`] [`356188ed7`]

### Changed

- **Mocks renamed to simulators** — `domain/src/mock/` became `simulators/`
  and every `Mock*` engine and service got a `*Simulator` name
  (`MockPricingEngine` → `PricingSimulator`, …; `MOCK_INSTRUMENTS` →
  `INSTRUMENTS_CATALOG`). [`a67b8f92a`] [`4389d0f90`] [`12b6a527f`]
- **No more kebab-case file names** — about 126 files and 5 folders across
  every package renamed: PascalCase for one-class or one-component modules,
  camelCase for everything else. 106 unit and 40 e2e tests still passed.
  [`007b6b325`] [`cd2a07b58`]
- **Domain ports moving to `Observable`** — reference data, pricing, execution
  and blotter, and analytics migrated, one port group per commit with the
  build green throughout; the workflow port was still to go at week's end.
  [`1f3a34859`] [`1929f222d`] [`c626903e0`] [`26035815f`]

### Decisions

- **RxJS is the one runtime dependency `@rtc/domain` may take**, and
  `Observable` the boundary type for ports and use cases — the
  [Observable-boundary design](docs/superpowers/specs/2026-05-03-phase-2-6-rxjs-observable-boundary-design.md).
  Port methods named `subscribe()` were renamed (`WorkflowPort.events()`,
  `getInstruments()`, `getDealers()`) so they do not collide with
  `Observable.subscribe()`. [`9a0838a61`] [`e3a27f83e`] [`edb1f95b1`]
  [`da7cc7fb1`]
- **"Simulators", not "mocks"**, for the in-process backends — set in the
  architecture revision. [`71ebb4d43`]
- **Presenters, `react-rxjs` and a composition root** for the next step —
  seven decisions (presenter shape, a factory plus a hooks Context, deleting
  pass-through wrapper hooks, no module singletons, …) in the
  [presenters design](docs/superpowers/specs/2026-05-01-phase-3-presenters-react-rxjs-design.md).
  Design only; not yet built. [`8f3ed0f17`]

### Under the hood

- **Plans and tracking** — the clean-architecture alignment plan, the
  use-case extraction, file-rename and Observable-boundary plans, and
  [`docs/superpowers/STATUS.md`](docs/superpowers/STATUS.md) recording what
  was done, what remained and the lessons from the extraction work.
  [`cb5278ddd`] [`f32cc94bc`] [`e638072e2`]
- A Mermaid parse error in the Credit RFQ sequence diagram fixed
  ([`740b7bc88`]); the server's WebSocket abort path cleans up its
  subscription entry like the error and complete paths do ([`6ff4f6afa`]).

Every commit: [`2026-W17...2026-W18`](https://github.com/bettersoftware-io/ReactiveTraderCloudClone/compare/2026-W17...2026-W18).

## 2026-W17 — 20 Apr – 26 Apr

Nothing reached `main` this week.

## 2026-W16 — 13 Apr – 19 Apr

Nothing reached `main` this week.

## 2026-W15 — 6 Apr – 12 Apr

Nothing reached `main` this week.

## 2026-W14 — 30 Mar – 5 Apr

Specs first, then the whole first app in two days. A behavioural spec suite
and a twelve-phase plan were written, and the plan was worked through to the
end: FX tiles, execution, blotter, RFQs, analytics, credit trading, a
WebSocket server and an end-to-end suite — all on in-browser mock backends,
with a real server one environment variable away.

### Added

- **Behavioural specifications** in [`specs/`](specs/README.md) — 40 files of
  domain models, service contracts, Gherkin features and mock-backend
  algorithms, written to drive the build. [`715790d86`]
- **Domain types, shared wire DTOs and mock backend engines** (pricing,
  execution, trade store, analytics, credit RFQ), with 79 tests. Ports were
  `AsyncIterable`/`Promise` at this point. [`ebb4456e6`]
- **The client shell** — dark/light theme persisted to `localStorage`, a
  connection state machine with idle/offline detection, and the
  header/footer/workspace layout. [`0bfeb0da5`]
- **FX live rates** — a 9-tile streaming grid with movement indicators,
  sparklines, currency filter tabs, a chart/price toggle and notional input
  with `k`/`m` parsing ([`9ea486e85`]); **trade execution and the blotter** —
  a tile execution state machine with confirmation overlays, and a 10-column
  blotter with sort, column and quick filters, new-trade highlight and CSV
  export ([`5bbdc1342`]).
- **FX RFQ and the analytics panel** — an RFQ state machine with countdown and
  widened quotes; a P&L chart, position bubbles and per-pair P&L bars.
  [`207377cf2`]
- **Credit trading** — the New RFQ form (instrument search, direction,
  quantity, dealer multi-select), RFQ tiles with filter tabs and quote
  acceptance, a credit blotter, a sell-side panel, and FX/Credit tabs in the
  header. [`4f42fa9b0`]
- **WebSocket server and real-mode client** — an HTTP+WS server on port 4000
  with every service handler and a throughput admin endpoint; a client
  `WsAdapter` with auto-reconnect; mock or real mode chosen by
  `VITE_SERVER_URL`; and an admin panel with a throughput control.
  [`7091c5067`]
- **Stale-data indicator** over tiles and analytics after a reconnect, and a
  **Playwright end-to-end suite** of 8 spec files across FX, credit,
  connection, analytics and theme. [`4f6df2fe3`]

### Fixed

- **E2E suite stabilised** — a dedicated port, strict locators, and waiting
  for the execution result before dismissing a confirmation ([`6ef23e1a1`]);
  the dev server port now comes from a `PORT` variable that Playwright sets,
  so both share one constant ([`819133a4c`] [`34813fb28`]).

### Under the hood

- **The build plan** —
  [`docs/implementation-plan.md`](docs/implementation-plan.md), twelve phases
  from domain types to e2e, with status tracking. [`3d8336ec2`]
- **Typecheck covers the e2e tests and config files** through a separate
  `tsconfig.node.json` ([`538e81ffc`]); Playwright output is git-ignored
  ([`510bffd3b`]); spec and plan formatting fixes ([`93ca05e1e`]).

Every commit: [`2026-W13...2026-W14`](https://github.com/bettersoftware-io/ReactiveTraderCloudClone/compare/2026-W13...2026-W14).

## 2026-W13 — 23 Mar – 29 Mar

Nothing reached `main` this week.

## 2026-W12 — 16 Mar – 22 Mar

The repo begins: an empty project to recreate ReactiveTraderCloud, the
real-time FX trading platform, from specifications under clean-architecture
rules, and the monorepo it would be built in.

### Added

- **The repository** — licence and a one-line README. [`6deec95ee`]
- **Monorepo scaffold** on pnpm workspaces and Turborepo, with four packages:
  `@rtc/domain` (no runtime dependencies), `@rtc/shared`, `@rtc/client` (React
  and Vite; today's `client-react`) and `@rtc/server` (Marble.js), plus the
  first `CLAUDE.md`. [`9a4950929`]

### Decisions

- **Turborepo config stays framework-blind** — task names and the dependency
  graph only, so swapping a framework needs no monorepo config change.
  Recorded in the scaffold commit and `CLAUDE.md`. [`9a4950929`]

Every commit: [`2026-W12`](https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commits/2026-W12).

[#2]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/2
[#3]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/3
[#5]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/5
[#6]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/6
[#7]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/7
[#8]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/8
[#9]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/9
[#12]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/12
[#13]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/13
[#14]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/14
[#15]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/15
[#16]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/16
[#17]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/17
[#18]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/18
[#19]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/19
[#20]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/20
[#21]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/21
[#23]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/23
[#25]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/25
[#27]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/27
[#29]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/29
[#30]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/30
[#31]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/31
[#32]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/32
[#33]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/33
[#34]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/34
[#35]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/35
[#36]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/36
[#37]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/37
[#38]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/38
[#39]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/39
[#40]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/40
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

[`007b6b325`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/007b6b32551f3d35184f10389c57a2529b122401
[`0281b2a4e`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/0281b2a4e8c218a63eeb77e8c29c9a93accc1f9b
[`02ec08e88`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/02ec08e88469171cc78fd13bec8235759a121168
[`044b06b1a`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/044b06b1a51900a667260f62e871a35be07d4acc
[`05ad81589`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/05ad81589afd458346fd05cdef0abcaf9400da3f
[`05ecee4bf`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/05ecee4bf946b9594347c8de444ad33a741e0f20
[`0609ad812`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/0609ad812e8f3e39f90eb06c44d42d6d9db7c598
[`065d70a84`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/065d70a844f580318a2cb1beaeb3e51ff27fa5eb
[`077386d69`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/077386d69050d1402e84bd2626af54ccd0185f2d
[`0bfeb0da5`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/0bfeb0da5cd07c32298b840f54f81d2e536e02ab
[`0c918415a`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/0c918415a2e43ca0817f92031574da9189e8cd45
[`0cdd152d5`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/0cdd152d5e2a5b94f014f27e182f1dac883c38c6
[`0f85701c5`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/0f85701c53cca2dcfc4e203415f9b92f747ebf0b
[`0fbb3c0fd`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/0fbb3c0fd74813398faf1a9d4b6c9d0bd5005eb2
[`1012197b7`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/1012197b78214e5a206b73ea6b796022064784e4
[`112e02d47`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/112e02d473eec4832962699aca52d86a5c805b80
[`1159f8456`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/1159f845637cb613292783ec670916363fd4e898
[`11cab0d72`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/11cab0d722cfdef941d397e8bf0724ab817dd886
[`1293b0386`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/1293b038622583beef16957465781e0f54424a8b
[`12b6a527f`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/12b6a527f9c0a96e408c4aa78805068f3fabef71
[`1665b6744`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/1665b67443f47551a7901423d6e75dcbf7c88fe6
[`176bbef09`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/176bbef091f426a282160b39e0eb6e2243c03dad
[`17e52efc9`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/17e52efc950eccc591b51fb68459b881ba30a7d6
[`184f94c03`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/184f94c036f3255aa0cf38c365f7ea7379fb67c0
[`186255e4a`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/186255e4abd90c63b426a5231a3310f3ce21920e
[`1929f222d`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/1929f222da5a1e4d3dcd49f3015420e931bc6ff2
[`198433eae`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/198433eaee15791200653e9736bfc661b2e06af2
[`19b43eff1`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/19b43eff1b0226c3e0189564218d221eed4155aa
[`1c56bdb1e`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/1c56bdb1e7617a0bfa73b06d677816e2fc36bdb8
[`1da239b26`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/1da239b26d3d1048c26c7d61089154c5b779c951
[`1db68b3ee`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/1db68b3eee6b5d48439e8c3cf41fa4a055dd2966
[`1e16bbc85`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/1e16bbc85a40fa4c496b42eb00bdbb680f4bdb59
[`1e22c3eb8`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/1e22c3eb8153aefdfc14b1fa949f1ed57e3d3817
[`1e5740c40`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/1e5740c402f8d654ccb091e1f18b1384b16971ea
[`1edf3227c`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/1edf3227c8732e9c9cde8c07b28ab5d227313677
[`1f3a34859`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/1f3a348590ddb2ae5be08394ea1d5f289152e964
[`207377cf2`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/207377cf2bd6658344189a4fc060bb506d3ff3cf
[`211304d2a`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/211304d2abf9aaff129a7bb4a2726ad01dbbb34a
[`211a09130`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/211a09130bb54c93d6e89bdad026c6e1ac9e8f64
[`2178563be`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/2178563bed610aadb1abb8eeb22ea305fd274a1a
[`22281ad68`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/22281ad68a87e9cc069a46999953b43dc6d25f37
[`22b39d629`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/22b39d6293eb75c701c28db70b38850558d817a3
[`23db8c77a`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/23db8c77a457d12df100c9a05d8896630060471e
[`23dd79093`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/23dd790935f56fd20a2deed574a24045cb93f651
[`242a26147`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/242a261478bb20af00e08a274a39ea2083ef6f77
[`247dac6c0`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/247dac6c00ed1da69a6b3e27fbba6d015040e7d3
[`256750262`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/2567502622a693910f1d66486cd7ded706664230
[`25e4fcdb9`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/25e4fcdb9e4c6baaa61372a09dc819332f3d3456
[`26035815f`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/26035815f9c7da7768a7ad40853b80911e4bddf8
[`27142a3d7`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/27142a3d716a602055f63fc65aa7c1f50e079717
[`271734057`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/2717340578cc01bb906ede09fcdb645f97cbedc4
[`285e19e0c`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/285e19e0caefdeb64f7f1309a66f7ff12ee39f4d
[`293e0e2d9`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/293e0e2d91d9a5fc15201d9f378144866d2787d7
[`299f210cc`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/299f210cc947f81642831b7fee430aef78424e5a
[`2a394a565`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/2a394a565f033870345390f46d411bdea93c720e
[`2b99843df`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/2b99843df3d6c98e7dec6816f7edfefe82e1ec5b
[`2f0b319de`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/2f0b319decc0f3e629d169c03c123bfb1bd7c10d
[`33744d5a8`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/33744d5a8789d97ab4af467ba1c1baecce771a5b
[`3394f4496`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/3394f4496adb31e4123e62d382f840a7a3d2ab8a
[`3434bd7dd`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/3434bd7dd97b380b7c80c9f9714aa3c42446d5b2
[`34813fb28`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/34813fb287428a271b258c30c87102a2bce0021e
[`356188ed7`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/356188ed7c16d2522551ac81078bb238a1564d6e
[`371355280`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/3713552809c922f2c132df1d788b9ff69d048c2e
[`3959c12dd`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/3959c12ddb3938403269169445582a4d35b5aca0
[`3a14022d3`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/3a14022d315d5158d95320907b9f8e02168623df
[`3aaf3cd61`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/3aaf3cd617f5f419c53744a1037d7f647b6e4734
[`3aff596ed`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/3aff596ed443e933bf1fd8df6efa5adee90f2b2e
[`3be2c8d50`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/3be2c8d500170b90dddfcd271a1e9f1eeefd2471
[`3caa5b3d8`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/3caa5b3d8826bead9ea01f7f5b05d2f311a0a5c0
[`3d8336ec2`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/3d8336ec25e8e52f4b9e194665ebcac7948fbf7a
[`3ff2934a7`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/3ff2934a765a326eb3a351c25c26435372f2b282
[`409e01266`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/409e01266b2ea179557760535d785f69ae21e3ce
[`42db5ba98`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/42db5ba984b82bad6623e119da560a038d5ebd48
[`4389d0f90`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/4389d0f90dcc62c5ed87f100a0ec3b4795e793f4
[`45fe824ca`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/45fe824ca8308a48c74cb12eb6d5c091565166c9
[`464cef75d`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/464cef75df15c6b652f08592b4d5c3a77bbb41d2
[`46e3a29a5`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/46e3a29a506134b15df40e5c07f7a15a30fb0544
[`4716841e8`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/4716841e856e79449e5bd3761d434dee432aad7f
[`471c6ba2e`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/471c6ba2e1b3eaa72dab0eaf3daf01aa39acd5b6
[`473771631`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/473771631fa3319b7ae9e01d740cb0d9128e8dca
[`47c43df0b`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/47c43df0bb1462712dd1c205bb098b83854962c6
[`47df586c9`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/47df586c90cafb855d8eccf04405ae21061ce688
[`481a045a4`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/481a045a4446cd55ad37a358a0683788db18fd2a
[`498a0226c`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/498a0226c692217c085d173b01996ce6839a3ea8
[`49d9d9696`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/49d9d96967c2cee6004a356b9fe99634dcbbbb10
[`49e576405`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/49e576405598e5ed93789d007761ecff345de51a
[`4e090869f`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/4e090869ff2c7766ab66283c51e377e69ef4a0b6
[`4e13abd94`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/4e13abd94abae1fdc7f4bdb9dfb84661097c31c1
[`4f42fa9b0`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/4f42fa9b05271c02fe1591bd0d65c28a4d919639
[`4f6df2fe3`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/4f6df2fe314bd6eefa127f4a43b6be46f93aea2d
[`510bffd3b`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/510bffd3b9ab6542fba4d61f50e46bfaade96d4e
[`538e81ffc`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/538e81ffcc497c639b6f7123b597b466ea77307b
[`53e6a9c4e`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/53e6a9c4ef2cf08e6d6ad69694188dbd15871495
[`5482ffb64`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/5482ffb647f91c4c202bf4cc296ce0310719c278
[`55a5fe702`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/55a5fe70281d99d41e7db70d771adaa56b2f1443
[`5787ca2a0`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/5787ca2a0122891df411e835a70858db348691f7
[`57a6f6dd3`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/57a6f6dd3897a4c0e851a74c65c2b62f9be88743
[`5bbdc1342`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/5bbdc13429eca5afbc783b3a3f97868c02e4b78b
[`5c1585dc9`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/5c1585dc90d44c2a44886048478938b9577d4048
[`5cd7690e7`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/5cd7690e76cb439a355a9c1a6913621d850c1ab9
[`5d40f3256`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/5d40f32568023f732d1082552d760a66be53803d
[`5e465a9c3`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/5e465a9c33713664b7840d26aac98fd6e6676292
[`5f3587787`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/5f35877878db97d77e540b89df0eccb3d47938d8
[`5f64284de`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/5f64284de32676c4ec9898af50dfc98426c9f8af
[`5f89424a0`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/5f89424a04710e53145b7c4fd2fd9ab270bf4890
[`600f65e10`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/600f65e106237777fd754610699e4948e047d993
[`60a38e059`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/60a38e059b3bdb981993b9b3485f4ace72c8835d
[`60a9c73b8`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/60a9c73b889c385a42dcded3b2e74147bec1e23d
[`6171b8178`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/6171b8178083910ace169b31a868d0f1f4c66ee4
[`65f02b6a6`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/65f02b6a6f4f5fa321d259948b7ef76b063e2e71
[`6a60fa8e5`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/6a60fa8e519190f79c6644c4f7eff4c7767cd77a
[`6a99871bc`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/6a99871bcb61622410f4ed4a1d81ff63f7f06473
[`6bff8ce08`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/6bff8ce082df427ad363df313abdf82936dba770
[`6cc48140a`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/6cc48140a1f5a730dbb1338d8c7cdd9975e5c9f0
[`6cebdc53d`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/6cebdc53dee5f308350988177397d0323e7e6e89
[`6d8656529`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/6d86565291ae84433376aaab60d5dee3b3066cf5
[`6deec95ee`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/6deec95ee59e89e986b20ed2af3d4a9841e9c600
[`6ef23e1a1`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/6ef23e1a193024e3a7115219c803f760892771cb
[`6ff4f6afa`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/6ff4f6afa867ef2a85092617a89e8757234587ac
[`7091c5067`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/7091c50679e77da282cf73ae28967cdeaf0f6cc4
[`70e8e01f1`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/70e8e01f1ad2e12445991eb95f240b069302a68a
[`7122fac57`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/7122fac57ac2a2a9ae28a1b0fcd819b510961ebe
[`715790d86`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/715790d86662bbe044bf1d88c4c332b814c3900f
[`71ebb4d43`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/71ebb4d437746426a3f461d8aefee86f0e4228b2
[`7230a4ebb`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/7230a4ebb87e765d73069bbc855de3a62df6a1ef
[`740b7bc88`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/740b7bc8898ea2de05b965cae698719f83e84d35
[`761be50cc`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/761be50cc4630ca955414c3bdff1b353203b9a53
[`769a47b00`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/769a47b005d33d393adc3759a1e6bd67af3dd705
[`778386298`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/778386298c449ebc9712bdd5e0ff7f5f2cf126ae
[`7969e724f`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/7969e724fc0903f8fa1f129f4dd6175a413e57d6
[`79a6865ef`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/79a6865efcb0100209fdfd059af16ddae94fcdaf
[`79b948676`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/79b948676e5fbeb89bfcfcbdc950b3b2aa2849fc
[`7b2230a93`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/7b2230a932a7158125dd5601b73f2e53bc1e52bd
[`7cf0d1e03`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/7cf0d1e031f3d404b6cb0bca57d01801e94c2c07
[`7eb630074`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/7eb630074468fc653e77b27aed3e8c9a7f1abad4
[`8047ce1de`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/8047ce1de36c7f1134a6e5e6061b448a3a7ebfc6
[`81487c2b1`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/81487c2b1196bfbb53acc35929ad3b19c983d192
[`819133a4c`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/819133a4c1695612552ca586f5da67f599b2f18b
[`81f29800e`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/81f29800e4b854b9091fd0000b6a6f2414a60a60
[`831df5b55`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/831df5b55aa6ae36ec1127d5f99882b38d9c4699
[`838765a38`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/838765a387682cd424575bae85dbd91f60d5c762
[`86a5e9e2b`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/86a5e9e2ba075c0850f40a6898d7c5a2209acbce
[`87645a1f0`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/87645a1f0280d84bf3e72786843937e59c0e636d
[`8ab1e64a4`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/8ab1e64a4e74098d585d997921a2eec3ea76a2ac
[`8c860e857`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/8c860e857aa9593c0c6740fe663f3190c727f1bf
[`8f3ed0f17`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/8f3ed0f176e7165d7ff8f60907c277a3a756346f
[`918867647`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/918867647e4315e3ea6da9a9f23dfb800d88d9ff
[`924e4c1b8`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/924e4c1b80599c08aa150f44c9af0c3760c6525b
[`936408f97`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/936408f97b4c8b621603b6f27e9eecf408b33c3f
[`936e5c043`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/936e5c043848d100e54a664de64d8d18c903f2b8
[`93a9eece1`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/93a9eece153c5f2dbc4c76782d70ff1a9981980a
[`93ca05e1e`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/93ca05e1e66469de37235a9a91755d69127f4f96
[`9420ed32b`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/9420ed32b3257b391fd95d683cafda836225a8ea
[`9462bba22`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/9462bba229cb8f26b3d8b367388a28c09ac60eeb
[`94db1671c`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/94db1671cc886717b5f1b7aed5771d0134bf10b3
[`95798bdc8`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/95798bdc859e2fbc7de1a05e64fd443df8557cba
[`95a0d1b40`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/95a0d1b40e934eea60d3b078a5f4cee6cdbdeee9
[`975d8d089`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/975d8d08969765e6acc65fe0dd3c8e59ada42921
[`9a0838a61`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/9a0838a61db931908c95cadfc5e8d1b4d85a2db5
[`9a4950929`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/9a4950929b3eaf634c7e5a977c0a7b9fa0953fe5
[`9ad591129`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/9ad5911299810d4e317c88f0e79790c15b2e2a31
[`9ba180f4d`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/9ba180f4dbc7b7bda805d4b72319b302d10da3e3
[`9c3bfc273`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/9c3bfc273c992d23d3098aefa6beef29ca3a8317
[`9e091d667`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/9e091d667765d32bfae14c40a3d25d87365d1dec
[`9ea486e85`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/9ea486e854d4017f59e1ca06ea21442b0cd000a1
[`9f11e10a3`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/9f11e10a3c653891bc143d1ae9132010a9a989a4
[`a0763f9a1`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/a0763f9a18705f1e9843410c5a0bb7a851404f2d
[`a187b7680`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/a187b7680d1357e33da72740dd5201ed88e3ca9f
[`a1cb6739c`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/a1cb6739cb857fc56c7b6ac9e3f3b51b724cb67e
[`a27fb4058`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/a27fb405861cce81a402a3c3530f6cc5cd269950
[`a2dc789a3`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/a2dc789a3b2ad2ea1ea5283f75fd5a614815aeed
[`a3b955a80`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/a3b955a80283b5d66f0ff80f518227738edbf38e
[`a67b8f92a`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/a67b8f92a11bdd5014e08c50e73dacc1eeaf92b8
[`a6d8ba1b1`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/a6d8ba1b159470a62b484968f309ebdf649eae05
[`a7ce2efdd`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/a7ce2efdd1e6641923ceb2a4d0f4f8689f47706e
[`a92037ae9`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/a92037ae9cf1356d05273f3f306d42aa6a91da52
[`a98cabece`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/a98cabeceea9c66c72d502e3cb1c1d9b4543b5cc
[`a9f59af4c`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/a9f59af4c5f71311099a24ba1bdaed86f730f6b9
[`ab26b5795`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/ab26b57950862c42850acc7b206efd33f0168951
[`ad481397b`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/ad481397bb155e502b6059f9d5f78b1af1b2fc16
[`af41e0b82`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/af41e0b8253817f968b7de6fdead92389c8ca776
[`b0ce6af61`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/b0ce6af614a07e347292747eea0d424835a2edc6
[`b0ec85c01`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/b0ec85c017f4f5ed39cbc18d43bc2402be910945
[`b12dd95c4`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/b12dd95c4408fb3dc32b7fd027097544481db920
[`b15280013`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/b15280013726697488b8c10d20eba23cbc61f254
[`b41e5e53e`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/b41e5e53ec371db1cdb7b2a47f1f3b1c992cdde3
[`b59bf3d97`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/b59bf3d970620f08983a8c22543a5eb986555233
[`b5c94453b`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/b5c94453bf66b18e8efa3a1c935738f56725542e
[`b7ff4cf58`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/b7ff4cf5802779cd5a28764f2cc138d8fa637884
[`b814bee85`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/b814bee8538695d2b92a905042f3f36338d71291
[`b8ebdd5ac`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/b8ebdd5ac01445c616d2482821faa80b0eeeba42
[`b9aa66807`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/b9aa668077fe73b9ab7ec524eb2925690e8fdee2
[`bbf28e4b8`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/bbf28e4b8f49db416926d0f0a3b70fa7bbf0bf61
[`c467afc2b`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/c467afc2b7e34dc8cf8c9c4ed97f1f3b70c36fb7
[`c4d74abf5`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/c4d74abf5ec01839e68b7bcc17bd8c0a786519d3
[`c626903e0`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/c626903e0428916925c77fb9cd8354de381246d1
[`c699d7136`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/c699d7136f7ae4fbc7b6c49e4e2720d55f005229
[`c74397dfe`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/c74397dfe34a072a830f8d393dc6782a120d992a
[`c78b93d68`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/c78b93d688bf06361faccfc78f690ee961ee6612
[`c7c990da3`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/c7c990da3b899fe35befd935d635e706c372a8d5
[`cb5278ddd`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/cb5278ddd872e655a558e25dd2eddbb92aadb8c8
[`cc75c3e83`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/cc75c3e838f10079add2b0794a3c0d9c9247d1f6
[`cd2a07b58`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/cd2a07b581bc68b70dbadbbaaf0bf3fdc8bce49c
[`cd88d0b1d`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/cd88d0b1d0925e502a6e04b8a7329abcce58218d
[`ce10e73b2`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/ce10e73b2985bc13e93ff6361f9dcd371e66217f
[`ce15ba3da`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/ce15ba3da3eab727b6fe0bc07bf943e656fd453d
[`ce5dd5231`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/ce5dd523129d06069e719e913ca434e39303b062
[`cf18ecf5e`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/cf18ecf5e568a21d4711715cf2a7505de01c433e
[`cf753765e`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/cf753765e2558aad09940a37a7bc00fbfced04ab
[`cf7700ee0`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/cf7700ee04f069bd125d386f8ba72e202a8e50a0
[`d1f76843f`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/d1f76843f906b4483aa86328e74286f9cbe15b7d
[`d365ca81b`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/d365ca81b8df80dbf981d55abc2d6662e2dda3bd
[`d38c7e2a7`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/d38c7e2a73f7786ca91b910eeb666be05c9ac38f
[`d447f6f6f`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/d447f6f6fa1b6d205e9837325fdffb835e4d1e36
[`d44e94cf9`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/d44e94cf943db51715a9c46227634d0d07570c1d
[`d4617c6c7`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/d4617c6c7f0d95c9391ab65f61ff7ba1572a3666
[`d56cd4e88`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/d56cd4e88bad3471ac15a8e4a727445afd891d7f
[`d88be7271`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/d88be727122862533fa50252553a64d63762c4e0
[`da429c3ee`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/da429c3ee004cbb963eff8ba403ee35f91b96d4b
[`da50337a5`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/da50337a56023f57c399d78f219785610e6009e0
[`da7cc7fb1`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/da7cc7fb18cd52c21749a0ea0f992490f26e0dda
[`db91e8139`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/db91e8139d3d17262577ce746a60a5e34dbb15be
[`dbe59f499`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/dbe59f4990383db31fb80c38ba7db34af343699c
[`dc142908d`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/dc142908df6390e4c2e0a059e74b68598ccaa7b4
[`de0ef3906`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/de0ef3906a00e14c80452bddc0602924392db42c
[`dee3fb627`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/dee3fb627146dc7dc9939c5a5cbffa12dc9f409e
[`df91926bc`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/df91926bc2266bf9b13867e9c65776419079d264
[`e25e952cd`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/e25e952cd7f08b5f950e0ed0e5d07de18030a5b1
[`e27242f16`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/e27242f1694a31d5d6fde545068af8ee0ba8bb09
[`e37be8283`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/e37be82831b1fe223598fd7018abbbef39bc59d9
[`e3a27f83e`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/e3a27f83e232ea1c2ebea4a4f83bff42a5b412b1
[`e45f6af27`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/e45f6af27e87e3b3aac957ed57dd99a7296cc4aa
[`e55a695a9`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/e55a695a9461e168373631ad9674b3cbe6ba2f09
[`e60b15480`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/e60b15480d051cefaeba2b52e813a3fd455cac8c
[`e63544053`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/e63544053cd37e96d20b49f5927944227599ac15
[`e638072e2`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/e638072e2ca63344e82873978ec1ccb2584bed19
[`e67b4695a`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/e67b4695acab78793d9af7443a6462593b25160a
[`e8a7c9140`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/e8a7c9140b640d0885d9001857d3868b48e20d4f
[`e95c5d0a1`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/e95c5d0a1d56b281adc8de77565e2b221af18158
[`ebb4456e6`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/ebb4456e63fad7c3e5e74f1597746a7f9c88ce43
[`ece0d656c`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/ece0d656cfd96c1feb904e51be25892c29493160
[`edb1f95b1`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/edb1f95b1867f8d2e941b6c1d095055ec859d784
[`eecc786ed`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/eecc786ed996dbde613d219c5a0db86fb38d4418
[`ef5779556`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/ef57795569d0acd3a450a750539b36c59c0e19e7
[`f05650e44`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/f05650e440ff2d3dc36cbfbd515147691189aa40
[`f0afd2d77`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/f0afd2d774b079888caf74ba48284f13c6841fd3
[`f212a4d65`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/f212a4d658de3c1bc6a0d6bac99b3138ffba2a0f
[`f26ae7243`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/f26ae72436ae54605ac2a55241310a9210d27f11
[`f29f1b8ea`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/f29f1b8ea1a3d1e2803f3239918e94c503239783
[`f32cc94bc`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/f32cc94bca02d9ecdab4644e102d385aeafea38c
[`f42da63cb`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/f42da63cb51c05ae8b65f8900f4d2057b911d6ed
[`f45ed106b`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/f45ed106bf703c797b46891369d071b4fdd3bc8f
[`f72777fce`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/f72777fce23e994c240a8da26fc785698db7a1e6
[`fa866dcf4`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/fa866dcf497029ec86fda7413c93f06a166ebc2a
[`fb164244a`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/fb164244a35e3e6f8e423483a6b0a3af3ad07811
[`fda1be966`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/fda1be966144732297ba8e786640e0a01993d407
[`fe3b3fdd3`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/fe3b3fdd3bfbe6c96025fb5762d6ecbe0fa1e485
[`ff3341e6b`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/ff3341e6b94034fbab8933fc75188ae4307721fb
[`ff52402a1`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/ff52402a15683de7674784ff4e1bfb24093c71b6
[`ff5f67ae1`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/ff5f67ae16d7d0b5c8c08a9e250fcd0fb1b1bf7b
[`ff6ba31f9`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/ff6ba31f9b54f90f530ac5a5a39cd8c77d973be6
[`ff6f4c234`]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/commit/ff6f4c234c9fcedc15d5738568b8c24521be9e1c
