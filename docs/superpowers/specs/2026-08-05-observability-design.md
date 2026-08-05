# Fullstack Observability & Distributed Tracing — Design

**Date:** 2026-08-05
**Status:** Approved
**Workstream:** Closes the "Observability workstream (Sentry + structured
logging + metrics)" entry in [`docs/STATUS.md`](../../STATUS.md), which
deferred this to its own brainstorm rather than bolting it on.

## 1. Goal

Give the deployed system real production observability across all four
surfaces — `@rtc/server` (Fly.io), `client-react` and `client-solid` (Vercel),
and `client-react-native` (EAS/iOS) — without letting a vendor SDK leak past
the adapter layer, and without exceeding a free tier.

Three deliverables: **errors** with readable stack traces, a **distributed
trace** spanning browser → WebSocket → server effect, and **structured logs +
metrics** replacing ad-hoc `console.*`.

## 2. The finding that reframes the vendor choice

**This app is WebSocket-native, and neither Sentry nor OpenTelemetry
auto-instruments WebSockets.**

- Sentry's `browserTracingIntegration` spans "every XMLHttpRequest or fetch
  request"; its docs direct you to manual propagation for "other places than
  HTTP requests (for example, with websockets)".
- OTel has the same gap and states the reason: WebSocket messages "flow over a
  single long-lived connection with no built-in mechanism for per-message
  metadata... there are no headers to piggyback on after the initial
  handshake."

The entire trading data path — pricing, blotter, RFQ, equities, Jarvis — is
`WsAdapter` → `ws` → `@rtc/ws-effects`. **None of it is HTTP.** So every
vendor's out-of-the-box tracing demo produces, here, a browser trace
containing page loads and nothing else.

**Consequence:** since propagation must be hand-written either way, the vendor
choice is not a tracing-capability decision. It is a backend/UX/cost decision.
And the seam already exists — `packages/client-core/src/adapters/WsAdapter.ts`
defines the frame as `{ type, payload, correlationId? }`.

## 3. Vendor survey (verified 2026-08-05)

| Vendor | Free tier | Verdict |
|---|---|---|
| **Sentry** | 5K errors, 5M spans, 5GB logs, 5GB metrics, 50 replays, **1 user**. Team from $26/mo | **Selected.** Best browser + RN story by a distance; Session Replay is the strongest demo artifact |
| **Grafana Cloud** | 10K series, 50GB each logs/traces/profiles, 3 users, 14-day retention, no card | **Pre-vetted fallback.** Most generous tier, pure OTLP; weakest frontend/RN error UX |
| **Honeycomb** | 20M events/mo | Best trace querying; no error/crash product. Pro repriced 2026-07-01 to $3.00/M events (from $1.30) |
| **SigNoz** | Self-host free; Cloud $0.30/GB, $49/mo min | OTel-native, but self-hosting means operating ClickHouse — a second production system that can be down |
| **Datadog** | None meaningful | **Disqualified.** APM $31–35/host/mo, RUM $0.15/1K sessions; worst lock-in |
| **Fly managed Prom + Grafana** | Free, already running | Not a competitor — a freebie we adopt for metrics |

Excluded: **Vercel**'s observability products (the web clients are static Vite
SPAs, not Next.js functions — no invocation to observe), and duplicating the
existing `@rtc/devtools-*` trio (which solves *local* inspection).

**Selected approach:** Sentry as the backend, reached through a repo-owned
port, with **W3C Trace Context and OTLP as the wire formats**. Standards are
committed to; the vendor is not.

## 4. Architecture

### 4.1 Naming — avoid the collision

`packages/domain/src/ports/telemetryPort.ts` **already exists** and means the
*in-app* metrics HUD (`throughput$`/`latency$`/`errorRate$`) rendered by the
Analytics view. The new port is **`ObservabilityPort`**. The distinction is
stated once in the docs: *telemetry = simulated metrics the app displays;
observability = real signals the app exports.*

### 4.2 Layering

```
domain/          ObservabilityPort (interface only — no vendor types)
client-core/     composition wires it; instrumentObservability(adapter, port)
client-react/    SentryBrowserObservability  ─┐
client-solid/    SentryBrowserObservability   ├─ ONLY places @sentry/* is imported
client-rn/       SentryNativeObservability    │
server/          OtlpObservability            ─┘
```

Instrumentation is a **`Proxy` decorator**, mirroring
`@rtc/devtools-core`'s `instrumentWsAdapter` — including its
`try {} catch {}` and its comment *"never block the real send"*. That
invariant is deliberate: the observer must never break the observed.

`@sentry/*` gets the same containment as the Anthropic and MCP SDKs — a
dependency-cruiser **allowlist** rule (`no-sentry-sdk-outside-adapters`),
written as "forbidden everywhere except these paths" so future packages are
covered by default.

**No new packages.** Adapters live in existing ones; the port lives in
`domain`. A nineteenth package would cost more in gate plumbing (coverage
config, knip keys, tsconfig paths, dep-cruise entries) than the adapters cost
in code.

## 5. Wire-level trace propagation

### 5.1 The envelope

`WsMessage` gains one optional field:

```ts
readonly type: string;
readonly payload?: unknown;
readonly correlationId?: string;
readonly traceparent?: string;   // W3C: 00-<32hex traceId>-<16hex spanId>-<flags>
```

Optional and ignored when absent, so simulator mode, the existing
`messages.test.ts` wire contracts, and any client that omits it keep working.
Written by the decorator, never by `WsAdapter` itself. Extracted server-side in
`packages/server/src/socket/`; the restored context wraps the `ws-effects`
effect handling the frame.

### 5.2 Sampling by frame class — and why

`PricingSimulator.ts:18-19` ticks each symbol at `max(150ms, random × 1000ms)`
— a mean interval of ~511ms, so **~2 frames/sec/symbol**. One tab with 8
symbols emits ~1.4M frames/day against a 5M spans/month allowance.

> **A single open tab would exhaust the entire monthly span quota in under
> four days** — if every tick became a span.

That is before `EquityMarketDataSimulator` (500ms), the 1s metric walks and
`EventLogSimulator` (500ms). Per-tick tracing is not merely expensive, it is
incoherent: 1.4M identical spans answer no question anyone asks.

| Frame class | Examples | Treatment | Volume |
|---|---|---|---|
| **RPC / user intent** | `rpc.executeTrade`, `rpc.createRfq`, `rpc.accept` | **100% traced**, full chain UI → effect → simulator → response | tens/day |
| **Subscription handshake** | `subscribe.pricing`, `subscribe.blotter` | **100% traced, trace ENDS at first frame** | tens/session |
| **Stream ticks** | pricing, equity quotes, metric walks | **Never spanned** — metrics only (frames/sec, p95 inter-tick gap, staleness) | millions/day → ~0 spans |
| **Errors / nacks** | `nack`, thrown effects, gateway drops | **Always captured, never sampled** | rare |

Head sampling *by class* beats probabilistic sampling because value-per-event
differs wildly: a uniform 1% sample would drop 99% of trade executions to save
on price ticks.

### 5.3 Side benefits

The `subscribe.pricing`/`unsubscribe.pricing` refcount pairing (the
tick-acceleration leak fixed in #171–#173) becomes directly observable — a
dangling subscribe span rather than a symptom noticed as accelerating ticks.
And the **devtools wire lens gets the trace id for free**, making a local
devtools entry and a production trace linkable by id.

## 6. Per-surface instrumentation

### 6.1 The sourcemap problem, precisely

Three concerns are conflated by the word "sourcemaps": **generate**, **deliver
to the browser**, **give to the error tracker**.

Today `RTC_SOURCEMAPS=1` couples generate + deliver (inline), and never does
the third. That is correct for its purpose — profiling a deployed build in the
DevTools flamechart — but cannot serve Sentry:

1. **Wrong deploys.** The flag is per-deploy opt-in; crashes happen on normal
   deploys, which carry no map.
2. **Inline is permanent bundle bloat.** `DEPLOY.md` says so itself: *"at the
   cost of a larger bundle — fine for an opt-in debug deploy."* Not fine
   shipped to every user forever on a permanently-animated HUD.
3. **Sentry would have to scrape.** With inline maps Sentry holds no copy; its
   only route is legacy JavaScript source fetching, which Sentry discourages,
   requires public assets, and is an org-level Security & Privacy toggle.
4. **Matching would be fragile.** Modern Sentry pairs map↔bundle by injected
   **Debug IDs**. Scraping falls back to URL matching, which breaks on
   cache-busting hashes and the existing `-dbg-` filename scheme.

| | Generate | Deliver to browser | Give to Sentry |
|---|---|---|---|
| `false` (lean today) | ✗ | ✗ | ✗ |
| `"inline"` (flag today) | ✓ | ✓ (bloat) | ✗ (scrape only) |
| **`"hidden"` (proposed)** | **✓** | **✗** | **✓ (uploaded)** |

`"hidden"` emits the `.map` but **omits the `//# sourceMappingURL` comment**,
so no browser requests it and bundles stay lean. The Sentry Vite plugin
uploads it with Debug IDs, then `sourcemaps.filesToDeleteAfterUpload` removes
it before Vercel sees it.

**Vercel's 403-on-`.map` becomes irrelevant** — that blocked *delivery*, and
Sentry never needs the map served. The two paths coexist unchanged in purpose:
`RTC_SOURCEMAPS=1` → inline, opt-in, for DevTools; every deploy → hidden,
uploaded + deleted, for Sentry.

### 6.2 `@rtc/server` (Fly.io)

- OTLP exporter → Sentry's OTLP endpoint (open beta). Two confirmed caveats
  designed around: **metrics over OTLP are unsupported** (metrics go to Fly's
  free managed Prometheus instead) and **span events are dropped** (use span
  *attributes*, never events).
- **`SIGTERM` flush is mandatory.** Fly's idle autostop suspends the machine; a
  buffered exporter loses everything in flight.
- The 16 `console.*` sites adopt `connectionLog.ts`'s existing structured,
  reason-tagged, token-safe shape — generalising the house pattern.
- **Jarvis is the highest-value trace:** one span tree per turn — user message
  → brain selection (scripted vs Haiku) → each of the 7 `@rtc/agent-tools`
  calls → response, with token counts and cost as attributes. Real money on a
  real API, today visible only through the in-app UsageMeter.

### 6.3 `client-react` + `client-solid`

Identical adapter shape (parity discipline). Errors with hidden-sourcemap
symbolication, Web Vitals, the §5 trace propagation, and — in Phase 6 —
Session Replay.

### 6.4 `client-react-native`

Native crash reporting (the capability nothing else offered). Sourcemaps
upload automatically on `eas build` (Expo SDK 50+ / Sentry RN 5.16+; this repo
is on SDK 57), but **EAS Update does not** — OTA updates need
`sentry-expo-upload-sourcemaps` wired into CI or every OTA crash arrives
unsymbolicated. Guarded by `__DEV__`, as the devtools decorators already are.

## 7. PII, sampling & free-tier guardrails

### 7.1 Leak surfaces, ranked

1. **Session tokens in the WS URL.** `packages/client-core/src/wsUrl.ts`
   appends `?access=<token>`. Any captured connection URL ships a **live
   session token** to a third party. Sentry SDKs capture URLs routinely.
2. **Credentials in the login POST.** `loginHandler.ts` receives
   `{ username, password }`.
3. **Jarvis chat content** — highest-entropy PII in the app.
4. **Session Replay DOM** — login form, trade tickets, blotter rows.
5. **Trade/RFQ payloads** — simulated here, but treated as real; a showcase
   repo that handles simulated trade data casually teaches the wrong pattern.

### 7.2 Scrub at the adapter, not in the vendor dashboard

Redaction is a **pure `scrub()` in the adapter**, running before anything
reaches the SDK — testable in our own tiers, reviewable in a PR, and it
survives a vendor swap. A privacy guarantee living in a SaaS checkbox is one
no test can assert.

- `?access=`, `Authorization`, and any `token`/`password`/`secret` key →
  `[redacted]`, **allowlist-shaped** (redact unless known-safe).
- `sendDefaultPii: false`, set explicitly rather than relied on as a default.
- **Jarvis: metadata, never content.** Token counts, tool names, latency,
  error class, brain choice as attributes; prompt/response text off by
  default behind an explicit flag.
- **Replay: `maskAllText` + `blockAllMedia` ON**, then selectively *unmask*
  non-sensitive HUD chrome. Opt-in to showing, not opt-in to hiding.

### 7.3 The error-burst circuit breaker

Sentry's free tier allows **5,000 errors/month**. This app runs rAF-driven
motion continuously plus simulators at 150ms/500ms/1s. **An exception thrown
in a per-frame loop is 60 errors per second.**

> **One animation-loop bug would exhaust the monthly error budget in ~83
> seconds.**

The app already models this — `ErrorRateSimulator` and `EventLogSimulator`'s
`errorBurst` perturbation exist for exactly these storms.

So the adapter carries a client-side breaker *before* any SDK call: dedupe by
fingerprint, cap per fingerprint per session, hard-cap total events/minute.
Sentry's server-side spike protection is a backstop, not the control — by the
time it engages the events are billed.

### 7.4 Environment separation

- **Vercel preview deploys** → tagged `environment: preview`, sampled to
  near-zero.
- **CI / e2e** → disabled under automation, reusing the **existing
  `navigator.webdriver` detection** proven in
  `packages/boot-splash/src/bootSplashGate.ts`. Two independent
  "are we automated?" checks would drift, and the failure is silent.
- **Local dev / simulator mode** → no DSN, so the decorator is never applied.
  Zero cost by construction.

## 8. Testing & CI gates

**A guarantee that isn't gated is a guarantee that decays.**

### 8.1 The dormancy trap

`no-sentry-sdk-outside-adapters` is only real if dep-cruiser evaluates it.
**Dep-cruiser package rules sat dormant until #327** because a new package
needs its `tsconfig.depcruise.json` line pair or its rules silently never
fire. The rule therefore ships **with a falsification test**: a deliberate
`@sentry/react` import in `domain`, verified to fail the gate, then removed.
Green-because-correct and green-because-dormant look identical otherwise.

### 8.2 What gets asserted

| Guarantee | Gate |
|---|---|
| `?access=` never leaves the browser (§7) | Unit tests on `scrub()` driven by real `wsUrl.ts` output; **falsification-verified** |
| No vendor SDK in inner packages (§4) | dep-cruiser allowlist + dormancy falsification + a grep gate mirroring the existing `src/ui` gates |
| `traceparent` optional + round-trips (§5) | Extends `messages.test.ts`: present → parsed; absent → identical behaviour |
| Stream frames are never spanned (§5) | A tick burst through the decorator yields **zero** spans, N metric increments — the free tier's life support |
| Circuit breaker holds (§7) | 1,000 identical errors in → capped count out; pinned clock, no wall-clock |
| Observer never breaks the observed (§4) | An adapter throwing on every call leaves pricing/RPC/execution fully working |
| Nothing sent under automation (§7) | e2e: **zero** network requests to the ingest host across a Playwright run |
| Port conformance | `ObservabilityPortContract` in `domain/src/ports/__contracts__/` |
| Coverage | New files join the ≥95% tiers; `NoopObservability` + recording fake excluded from the denominator, per the `FakeWsAdapter` precedent |

### 8.3 Deploy-side gate

`DEPLOY.md` already asserts the inline map *is present* when requested. The
mirror image: **assert no `.map` survives into the deploy output**, proving
`filesToDeleteAfterUpload` ran. A silent regression there ships source to the
public and must fail loudly.

### 8.4 Why falsification tests are load-bearing here

Every gate above asserts a **negative** — no token, no import, no span, no
request. A negative assertion passes trivially when the mechanism is absent or
disabled. Deliberately breaking it once is the only way to distinguish
"correctly clean" from "not running".

## 9. Phased rollout

| Phase | Ships | Rationale |
|---|---|---|
| **1 · Foundation + server** | `ObservabilityPort` + contract + `NoopObservability`; dep-cruiser rule + falsification; server OTLP adapter; SIGTERM flush; `console.*` → structured logs | Zero client risk; closes the worst current gap — **a Fly server crash leaves no readable record after the machine suspends** |
| **2 · Web errors + symbolication** | Sentry browser adapter (both clients); `scrub()`; circuit breaker; webdriver gate; environment tagging; `sourcemap: "hidden"` → upload → delete + the "no `.map` survives" gate | The practical payoff: readable traces on **every** deploy, not only flagged ones |
| **3 · The distributed trace** | `traceparent` in `@rtc/shared`; decorator writes, server extracts; RPC + handshake tracing by class; trace id in the devtools wire lens | The showcase artifact; plumbing proven first |
| **4 · Jarvis** | Span tree per turn with token/cost attributes | The only instrumentation with a dollar sign attached |
| **5 · React Native** | Sentry RN + Expo plugin under `__DEV__`; EAS Build auto-upload; **explicit CI step for EAS Update sourcemaps** | Separate release cadence, decouples cleanly |
| **6 · Optional** | Session Replay with masking-by-default; Fly Prometheus dashboards | Best demo artifact, largest PII surface — lands last, deliberately |

## 10. Explicitly out of scope

Decided, not forgotten:

- **Not replacing `@rtc/devtools-*`.** It solves *local* inspection; this
  solves *production*. They meet at one point: the shared trace id (§5.3).
- **No log shipping to SaaS.** Structured logging is in scope; forwarding it
  off-box is not — `fly logs` is adequate at this scale.
- **No alerting or on-call.** Nobody is paged for a demo app.
- **No self-hosted backend.** Surveyed, rejected: operating ClickHouse is a
  second production system that can be down.
- **No per-tick tracing.** Decided in §5.2 on the arithmetic.
- **No metrics via Sentry.** Unsupported over OTLP today; Fly's free
  Prometheus covers it.
- **No RUM / product analytics.** Different question, different tool.

## 11. Known constraints & revisit triggers

**Sentry's free tier is 1 user.** Only one person gets a login; anyone else
means the $26/mo Team plan. Not a technical limit, but the one most likely to
bite.

**Pre-vetted exit: Grafana Cloud** (50GB traces, 3 users, 14-day retention, no
card). Because §4 puts everything behind a port, §5 propagates W3C
`traceparent`, and §6.2 exports OTLP, migration is four adapter files and an
env var.

Revisit if: the error budget binds, more seats are needed, or Sentry's OTLP
**metrics** support leaves beta (which would let metrics consolidate off Fly).

## 12. Sources

Verified 2026-08-05.

- [Sentry pricing review](https://cubeapm.com/blog/sentry-pricing-review/)
- [Sentry OTLP endpoint (open beta)](https://github.com/getsentry/sentry/discussions/85902) ·
  [OTLP docs](https://docs.sentry.io/concepts/otlp/)
- [Sentry browser auto-instrumentation](https://docs.sentry.io/platforms/javascript/tracing/instrumentation/automatic-instrumentation/) ·
  [custom trace propagation](https://docs.sentry.io/platforms/javascript/tracing/distributed-tracing/custom-instrumentation/)
- [Sentry Vite sourcemaps](https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite/) ·
  [@sentry/vite-plugin](https://www.npmjs.com/package/@sentry/vite-plugin) ·
  [legacy source fetching](https://docs.sentry.io/platforms/javascript/sourcemaps/troubleshooting_js/legacy-uploading-methods/)
- [Sentry Expo sourcemaps](https://docs.sentry.io/platforms/react-native/sourcemaps/uploading/expo)
- [Grafana Cloud free tier](https://grafana.com/products/cloud/free-tier/)
- [OpenTelemetry JS status](https://opentelemetry.io/docs/languages/js/) ·
  [context propagation](https://opentelemetry.io/docs/concepts/context-propagation/)
- [Honeycomb 2026 Pro plan changes](https://docs.honeycomb.io/get-started/honeycomb/2026-pro-plan-changes)
- [SigNoz pricing](https://cubeapm.com/blog/signoz-pricing-review/) ·
  [Datadog pricing](https://www.cloudzero.com/blog/datadog-pricing/)
- [Fly.io metrics](https://fly.io/docs/monitoring/metrics/)
