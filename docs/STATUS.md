# Project Status — Pending Work

> Cross-workstream backlog: what's **not** done yet across the whole repo.
> Finished work is **not** listed here — it's removed as it lands. For history
> see git log; for the clean-architecture phase log see
> [superpowers/STATUS.md](superpowers/STATUS.md).
>
> Speculative, not-yet-planned ideas live in [IDEAS.md](IDEAS.md) (the icebox);
> they move here once they earn a spec or plan. See [README.md](README.md) for
> the full document map.
>
> Maintained via the `tracking-workstream-status` skill. **Last updated: 2026-07-15**

## 🟡 In progress

- **SolidJS port** — Phase 3 remaining (credit / equities / admin). Plan: [superpowers/plans/2026-07-12-solidjs-port.md](superpowers/plans/2026-07-12-solidjs-port.md)

## 🔴 Designed, not built (plan/spec merged, no implementation)

- **Jarvis AI assistant** — impl deferred. Spec: [superpowers/specs/2026-07-12-jarvis-ai-assistant-design.md](superpowers/specs/2026-07-12-jarvis-ai-assistant-design.md) (no plan file yet)
- **Login + server-side auth (Phase 1)** — not built; Phase 2 not yet spec'd. Plan: [superpowers/plans/2026-07-12-phase1-login-and-server-auth.md](superpowers/plans/2026-07-12-phase1-login-and-server-auth.md)
- **Feature flags** — OpenFeature + Flagsmith. Plan: [superpowers/plans/2026-07-01-feature-flags.md](superpowers/plans/2026-07-01-feature-flags.md)
- **Power-saver mode** — Plan: [superpowers/plans/2026-07-09-power-saver-mode.md](superpowers/plans/2026-07-09-power-saver-mode.md)
- **Devtools MV3 Chrome extension** — third `Duplex` transport (ChromeRuntimeDuplex + content-script bridge + tab-keyed background router + RTC devtools panel); observe-only, zero app-side changes. Plan: [superpowers/plans/2026-07-14-devtools-chrome-extension.md](superpowers/plans/2026-07-14-devtools-chrome-extension.md)
- **Devtools hardening & liveness** — six tracked follow-ups: inspector registry caps, type-safe event builder, prod `/devtools/` copy-path check, panel-side liveness timeout, row memoization, WAAPI change-flash. Plan: [superpowers/plans/2026-07-15-devtools-hardening.md](superpowers/plans/2026-07-15-devtools-hardening.md)
- **Devtools intent injection** — panel→app intent invocation (first inbound write), dev-build-only gate. Plan: [superpowers/plans/2026-07-15-devtools-intent-injection.md](superpowers/plans/2026-07-15-devtools-intent-injection.md)
- **Devtools record / replay / time-scrub** — panel-only flight recorder + JSON export/import + scrub slider over the recorded buffer. Plan: [superpowers/plans/2026-07-15-devtools-record-replay.md](superpowers/plans/2026-07-15-devtools-record-replay.md)
- **Devtools RN inspection** — WebSocket-relay transport (`WsRelayDuplex`) + standalone dev-machine relay + decorators at the RN composition root. Plan: [superpowers/plans/2026-07-15-devtools-rn-inspection.md](superpowers/plans/2026-07-15-devtools-rn-inspection.md)

## 🟠 Planned but gated / not executed

- **RN visual snapshot testing / Maestro e2e** — was gated on the v3 design rehaul (now landed); still not executed. Plan: [superpowers/plans/2026-07-10-rn-visual-snapshot-testing.md](superpowers/plans/2026-07-10-rn-visual-snapshot-testing.md)
- **Atomic test-ID renames** — plan written, never executed. Plan: [superpowers/plans/2026-07-10-atomic-testid-renames.md](superpowers/plans/2026-07-10-atomic-testid-renames.md)

## ⚪ Optional / next step (no plan file yet)

_None currently._
