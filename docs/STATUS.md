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
> Maintained via the `tracking-workstream-status` skill. **Last updated: 2026-07-17**

## 🟡 In progress

- **SolidJS port** — Phases 4–5 remaining (visual parity vs react goldens; e2e + CI symmetry + docs). Phase 3 shipped PR #216: full contract parity, all 82 spec files green on Solid. Plan: [superpowers/plans/2026-07-12-solidjs-port.md](superpowers/plans/2026-07-12-solidjs-port.md)

## 🔴 Designed, not built (plan/spec merged, no implementation)

- **Jarvis AI assistant** — impl deferred. Spec: [superpowers/specs/2026-07-12-jarvis-ai-assistant-design.md](superpowers/specs/2026-07-12-jarvis-ai-assistant-design.md) (no plan file yet)
- **Login + server-side auth (Phase 1)** — not built; Phase 2 not yet spec'd. Plan: [superpowers/plans/2026-07-12-phase1-login-and-server-auth.md](superpowers/plans/2026-07-12-phase1-login-and-server-auth.md)
- **Feature flags** — OpenFeature + Flagsmith. Plan: [superpowers/plans/2026-07-01-feature-flags.md](superpowers/plans/2026-07-01-feature-flags.md)
- **RN mobile-v1 UI rehaul** — total HUD redesign of `@rtc/client-react-native` (native motion/render stack, radial command-dock nav, ambient background, event-driven motion, incremental Skia boot suite). Phased master spec; **Phase 0 (native foundation) plan ready**, Phases 1–7 planned as predecessors land. Spec: [superpowers/specs/2026-07-16-rn-mobile-v1-rehaul-design.md](superpowers/specs/2026-07-16-rn-mobile-v1-rehaul-design.md); Phase 0 plan: [superpowers/plans/2026-07-16-rn-mobile-v1-rehaul-phase-0-native-foundation.md](superpowers/plans/2026-07-16-rn-mobile-v1-rehaul-phase-0-native-foundation.md)

## 🟠 Planned but gated / not executed

- **RN visual snapshot testing / Maestro e2e** — now scheduled as **Phase 1** of the RN mobile-v1 rehaul (above); this standalone plan is the reference for that phase. Plan: [superpowers/plans/2026-07-10-rn-visual-snapshot-testing.md](superpowers/plans/2026-07-10-rn-visual-snapshot-testing.md)
- **Atomic test-ID renames** — plan written, never executed. Plan: [superpowers/plans/2026-07-10-atomic-testid-renames.md](superpowers/plans/2026-07-10-atomic-testid-renames.md)

## ⚪ Optional / next step (no plan file yet)

- **Power-saver UI on Solid + RN** — power-saver mode shipped for the web React client (PR #218; ref [power-saver-mode.md](power-saver-mode.md)). The Solid and RN clients **persist** the `powerSaver` preference via their adapters but have **no UI** for it — no header ⌁ toggle, no ambient-layer gating, no `--fx-play` motion pausing. Fold the Solid UI into the SolidJS-port workstream (its contract specs currently allowlist power-saver as React-only until ported) and the RN UI into the RN mobile-v1 rehaul. Neither is spec'd yet.
