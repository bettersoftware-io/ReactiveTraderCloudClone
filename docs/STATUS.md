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
- **RN mobile-v1 UI rehaul** — total HUD redesign of `@rtc/client-react-native`. **Phase 0 (native foundation) built** (reanimated/skia/gesture-handler/expo-blur/haptics/sensors + babel/jest wiring + `GestureHandlerRootView` + flag-gated `MotionProbe`; zero visual change, verified on the iOS simulator). **Phase 1 (visual harness) & Phase 2 (theme/ambient/motion primitives) plans written** — independent tracks off Phase 0, designed to execute **in parallel**; not yet built. Phases 3–7 (shell/dock, modules, boot, polish) remaining, planned as predecessors land. **Known follow-up:** the CI "Expo bundle smoke" tolerates a react-native-worklets@0.10.0 x86-only Babel-plugin crash (arm64 builds fine) — remove the tolerance in `.github/workflows/ci.yml` once worklets ships an x86 fix / an Expo SDK bump lands. Spec: [superpowers/specs/2026-07-16-rn-mobile-v1-rehaul-design.md](superpowers/specs/2026-07-16-rn-mobile-v1-rehaul-design.md); plans: [Phase 0](superpowers/plans/2026-07-16-rn-mobile-v1-rehaul-phase-0-native-foundation.md), [Phase 1](superpowers/plans/2026-07-17-rn-mobile-v1-rehaul-phase-1-visual-harness.md), [Phase 2](superpowers/plans/2026-07-17-rn-mobile-v1-rehaul-phase-2-theme-ambient-motion.md)

## 🔴 Designed, not built (plan/spec merged, no implementation)

- **Jarvis AI assistant** — impl deferred. Spec: [superpowers/specs/2026-07-12-jarvis-ai-assistant-design.md](superpowers/specs/2026-07-12-jarvis-ai-assistant-design.md) (no plan file yet)
- **Feature flags** — OpenFeature + Flagsmith. Plan: [superpowers/plans/2026-07-01-feature-flags.md](superpowers/plans/2026-07-01-feature-flags.md)

## 🟠 Planned but gated / not executed

- **RN visual snapshot testing / Maestro e2e** — the detailed task source for **Phase 1** of the RN mobile-v1 rehaul (above); the [Phase 1 plan](superpowers/plans/2026-07-17-rn-mobile-v1-rehaul-phase-1-visual-harness.md) adopts it with reconciliation amendments (real bundle id, provisional shell-only goldens). Base plan: [superpowers/plans/2026-07-10-rn-visual-snapshot-testing.md](superpowers/plans/2026-07-10-rn-visual-snapshot-testing.md)
- **Atomic test-ID renames** — plan written, never executed. Plan: [superpowers/plans/2026-07-10-atomic-testid-renames.md](superpowers/plans/2026-07-10-atomic-testid-renames.md)

## ⚪ Optional / next step (no plan file yet)

- **Auth Phase 2 — per-user server state isolation** — not yet spec'd. Phase 1 (login + genuine server-side auth) shipped PR #210; the RN login screen + [authentication.md](authentication.md) shipped PR #226; the three deferred follow-ups (client-tracked server `exp`, RN AsyncStorage session persistence, RN sign-out control) shipped 2026-07-17. Phase 2 would add a per-connection `ctx` keyed by the authenticated user — per-user blotter/orders/positions with shared hot market-data streams — replacing today's process-wide shared simulator singletons. Phase 1's signed token + `AuthPresenter` are the seam.
- **Power-saver UI on Solid + RN** — power-saver mode shipped for the web React client (PR #218; ref [power-saver-mode.md](power-saver-mode.md)). The Solid and RN clients **persist** the `powerSaver` preference via their adapters but have **no UI** for it — no header ⌁ toggle, no ambient-layer gating, no `--fx-play` motion pausing. Fold the Solid UI into the SolidJS-port workstream (its contract specs currently allowlist power-saver as React-only until ported) and the RN UI into the RN mobile-v1 rehaul. Neither is spec'd yet.
- **`pnpm dev` → `dev:web` with feature-flag client selection** — `pnpm dev` is currently a plain alias of `dev:react` (React web client, simulator mode). The intended end state is to rename it to `dev:web` and have it pick the web client implementation (React vs Solid) from a feature flag, while `dev:react` / `dev:solid` remain the explicit per-implementation entry points. Documented in [CLAUDE.md](../CLAUDE.md) (Build Commands → "Future direction"); not spec'd or built. Naturally pairs with the SolidJS-port workstream reaching client parity.
