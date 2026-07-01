# Research: feature-flag / feature-management tooling landscape (2026)

**Date:** 2026-07-01 · **Status:** point-in-time survey (pricing, free-tier
limits, and package versions change frequently — **re-verify vendor pages before
adopting**).

Companion to [ADR-004: The ViewModel seam and feature-flag layering](../adr/ADR-004-viewmodel-seam-and-feature-flags.md),
which records the *layering decision* (flag **value** → a `useFeatureFlag`
ViewModel member; flag **client/SDK** → a `FeatureFlagPort` adapter at the
composition root; component **choice** → the view). This note holds the full
**catalogue of solutions, pricing, and adoption signals** the tool-selection
draws on, plus the boot-time-evaluation analysis, so the decision record and the
[implementation design](../superpowers/specs/2026-07-01-feature-flags-design.md)
stay lean.

## Why this project's constraints narrow the field

Three project facts do most of the filtering:

- **`@rtc/domain` may depend only on `rxjs` at runtime.** Any vendor SDK can live
  *only* in a composition-root adapter behind `FeatureFlagPort` — never in the
  domain or the UI. This is a hard architectural constraint, not a preference.
- **This is a capability *showcase*, not a ship-the-minimum product.** The clean
  port/adapter boundary is itself a feature to demonstrate — the goal is to
  support 2–3 vendors swappable behind one adapter, so "serious, flexible, would
  pass at a real start-up" beats "smallest footprint."
- **Two concrete use cases with different shapes:**
  1. a **boot-time** flag selecting which client framework bundle to load
     (React vs SolidJS), resolved *before* the app bundle loads; and
  2. a **runtime** flag toggling behaviour live (e.g. disable animations).

## The headline: OpenFeature is the spine, not a vendor

[OpenFeature](https://openfeature.dev) (CNCF-hosted, Apache-2.0) is a
**vendor-neutral SDK specification**, not a flag service. You code against one
API and plug in any conforming "provider"; swapping providers is a
`setProvider()` call, and multiple providers can coexist by "domain." This is the
ports-and-adapters pattern elevated to an industry standard — `FeatureFlagPort`
is, in effect, a hand-rolled mini-OpenFeature, so adopting OpenFeature as the
adapter's inner API is the most on-theme choice for this codebase.

**Core SDK maturity (npm, observed 2026-07-01):** all current and Apache-2.0.

| Package | Latest | Published |
|---|---|---|
| `@openfeature/web-sdk` | 1.9.0 | 2026-06-12 |
| `@openfeature/react-sdk` | **1.4.1 (post-1.0, stable)** | 2026-06-19 |
| `@openfeature/server-sdk` | 1.22.0 | 2026-06-12 |

The official [`open-feature/js-sdk-contrib`](https://github.com/open-feature/js-sdk-contrib/tree/main/libs/providers)
monorepo ships providers — most with **both** server *and* browser/web variants —
for Flagsmith, GrowthBook, ConfigCat, Unleash, LaunchDarkly (client), Flipt,
GO Feature Flag, and flagd. Even Vercel's Flags SDK integrates via
`@flags-sdk/openfeature`. So 2–3 tools can genuinely coexist behind one adapter.

## The landscape, tiered

| Tier | Options (2026) | Character |
|---|---|---|
| **Standard** | **OpenFeature** | Vendor-neutral abstraction; the spine everything plugs into |
| **OSS, self-hostable** | **Unleash**, **Flagsmith**, **GrowthBook**, **PostHog** | Real dashboards you run; no lock-in |
| **Commercial SaaS** | **LaunchDarkly**, **Statsig**, **ConfigCat**, **Vercel Flags** | Most raw capability; least self-contained |

**Adoption signals (directional — from aggregators, not primary):** PostHog
~34k ★ · Unleash ~13k ★ · GrowthBook ~7.9k ★ · Flagsmith ~6.4k ★.

Options considered but not shortlisted, with why:

- **LaunchDarkly** — deepest ecosystem and a genuinely usable $0 Developer tier
  (unlimited seats/flags, 1 project/3 envs, ~1k client MAU), but **proprietary
  with no self-host**, and Foundation pricing is usage-based/unpredictable
  (~$8.33/1k client MAU or $10/service connection, yearly). Conflicts with the
  OSS/self-hostable showcase preference. [pricing](https://launchdarkly.com/pricing/)
- **PostHog** — generous free tier (1M flag requests/mo) and OSS/self-host, but
  it's a whole product-analytics + session-replay suite; heavier than a
  flag-focused pick. Usage-based beyond the free tier.
- **Unleash** — mature Apache-2.0 self-host standard (~13k ★), but its admin UI is
  "functional but dated" and its **OpenFeature support is community-maintained
  and web-only** — a subtle risk to the "clean swap" guarantee (one vendor
  comparison scored Unleash at 0% *official* OpenFeature coverage).
- **Flipt / Statsig / DevCycle / Vercel Flags** — providers exist, but pricing and
  specifics were **not confirmed** against primary sources this pass (a low-quality
  aggregator's Flipt/Flagsmith/GrowthBook cards were caught with wrong star counts
  and license/pricing detail and discarded during verification). Treat any Flipt
  specifics as unverified.

## The shortlist, primary-sourced (observed 2026-07-01)

All pricing observed on vendor `/pricing` pages; versions from the npm registry;
stars/license from GitHub repo pages.

| | **Flagsmith** | **GrowthBook** | **ConfigCat** |
|---|---|---|---|
| **License / self-host** | BSD-3 · **self-host free & unlimited** | MIT open-core · **self-host free & unlimited** | Proprietary SaaS · **no full self-host** (MIT eval *Proxy* only) |
| **Free tier** | 50k req/mo, **1 seat**, unlimited flags/envs | **3 users**, unlimited flags/traffic, 1M CDN req/mo | 10 flags, 2 envs, **unlimited seats**, 5M downloads/mo, 7-day audit |
| **First paid** | Start-Up $40/mo (annual) / $45 monthly | Pro $40/seat/mo | Pro $110/mo |
| **Cost axis** | per-request (+seat higher up) | per-seat (Cloud) | per-flag-count + bandwidth |
| **GitHub** | 6.4k ★, released 2026-07-01 (v2.251) | 7.9k ★, v4.4.0 (2026-05-27) | SDKs only (dashboard closed-source) |
| **OF server provider** | `@openfeature/flagsmith-provider` 0.1.2 | `@openfeature/growthbook-provider` 0.1.2 | `@openfeature/config-cat-provider` **0.8.0** |
| **OF web provider** | `@openfeature/flagsmith-client-provider` 0.2.0 (Feb '26) | `@openfeature/growthbook-client-provider` 0.1.2 ⚠️ **stale (Sept 2024)** | `@openfeature/config-cat-web-provider` 0.2.0 (Sept '25) |

**The single fact that reorders the shortlist:** every vendor OpenFeature provider
is pre-1.0, but they are **not** equally maintained. GrowthBook's *web* provider
has not shipped since **September 2024 (~21 months stale)** — a real risk to the
provider-swapping showcase. ConfigCat's pair is freshest; Flagsmith's client
provider is recent (Feb 2026) and the repo released the day of this survey.

**Unverified:** free-tier data-retention for Flagsmith and GrowthBook (not
published on their pricing pages).

## Boot-time evaluation — can each resolve the React-vs-SolidJS flag *before* the bundle loads?

The constraint: a client-side flag SDK cannot run from inside a bundle that has
not been chosen yet. So the boot flag must resolve at the **edge / `index.html`**,
not in the app.

- **Flagsmith → yes, cleanest.** A single keyed REST call, no SDK, returns
  **already-evaluated** flags, edge-routed to the nearest DC:
  `GET https://edge.api.flagsmith.com/api/v1/flags/` with a *public*
  `X-Environment-Key`. Inline it in `index.html` / an edge function and pick the
  bundle. For runtime flags it also has a first-class **isomorphic
  `getState()`/`setState()`** hydration so the client does not re-fetch.
  [flags-api](https://docs.flagsmith.com/integrating-with-flagsmith/flagsmith-api-overview/flags-api/code-examples) ·
  [next-ssr](https://docs.flagsmith.com/clients/next-ssr) ·
  [edge-api](https://docs.flagsmith.com/performance/edge-api)
- **ConfigCat → yes, with caveats.** The raw CDN `config.json` returns *targeting
  rules, not a decided value*, so a bare `curl` is not enough — either run the
  **ConfigCat Proxy** (`POST /api/eval` or OFREP `/ofrep/v1/evaluate/flags/{key}`)
  or evaluate in your own SSR (minding the documented cold-cache stale-default
  caveat). More moving parts, but **OFREP-conformant** (a vendor-neutrality plus).
  [proxy endpoints](https://configcat.com/docs/advanced/proxy/endpoints/) ·
  [js-ssr](https://configcat.com/docs/sdk-reference/js-ssr/)
- **OpenFeature rule of thumb:** back the **boot** decision with the **server SDK
  / OFREP single-flag** call at the edge; use the **web SDK (static-context bulk
  eval)** for **runtime** flags inside the app — the static-context web paradigm
  is explicitly designed to "pre-load flags before the app starts."
  [OFREP](https://openfeature.dev/docs/reference/other-technologies/ofrep/) ·
  [web-v1](https://openfeature.dev/blog/web-v1-announcement/)
- **UX gotcha:** any blocking flag fetch before render adds a round-trip to first
  paint; mitigate with edge caching and (for runtime) the isomorphic hydration
  hand-off so the client reuses server-fetched state.

## Verdict / recommendation for this project

**Flagship: Flagsmith behind OpenFeature.** It uniquely wins on all four axes that
matter here — self-hostable & free (BSD-3), a real dashboard, the best boot-time
story (public *evaluated* REST + isomorphic hydration), and a fresh, maintained
OpenFeature web provider. **ConfigCat** is the strong hosted / OFREP alternative
(unlimited seats, freshest providers, OFREP-conformant), and **GrowthBook** is the
experimentation option *if* its stale web provider is acceptable.

Because everything sits behind `FeatureFlagPort`, the plan is to wire **a
dependency-free `StaticFeatureFlagAdapter` + an `OpenFeatureFeatureFlagAdapter`
(Flagsmith) now**, and keep **ConfigCat / GrowthBook as documented one-line
drop-ins**. That swap *is* the clean-architecture demonstration.

## How this was researched (provenance)

- A deep-research pass (fan-out web search → source fetch → 3-vote adversarial
  verification of 25 claims → synthesis): 22 confirmed, 3 refuted and dropped.
- Two follow-up verification agents: (a) primary-source pricing / GitHub stars /
  exact npm package names+versions; (b) boot-time / server-side evaluation
  validation for Flagsmith and ConfigCat.
- **Caveat:** GitHub-star and some adoption figures leaned partly on blog
  aggregators and are directional. Pricing and free-tier limits are time-sensitive
  (verified July 2026). Several OpenFeature web providers are pre-1.0.

### Key primary sources

- OpenFeature: <https://openfeature.dev/docs/reference/sdks/client/web/react/> ·
  <https://github.com/open-feature/js-sdk-contrib> ·
  <https://github.com/open-feature/spec>
- Flagsmith: <https://www.flagsmith.com/pricing> ·
  <https://github.com/Flagsmith/flagsmith> · <https://docs.flagsmith.com>
- GrowthBook: <https://www.growthbook.io/pricing> ·
  <https://github.com/growthbook/growthbook>
- ConfigCat: <https://configcat.com/pricing/> ·
  <https://configcat.com/docs/advanced/proxy/proxy-overview/>
- LaunchDarkly: <https://launchdarkly.com/pricing/>
