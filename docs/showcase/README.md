# Showcase — self-contained HTML artifacts

Single-file, dependency-free HTML pages generated **on the fly** by Claude Code
during a working session, kept here as examples of the kind of visual artifact it
can produce alongside the actual work. Each is self-contained (inline CSS/JS, no
external requests), theme-aware (light/dark, with a manual toggle), and safe to
open straight from disk in any browser.

These are **companions**, not sources of truth — the authoritative docs are the
markdown they visualize.

| File | Visualizes | Authoritative doc |
|---|---|---|
| [`updating-goldens.html`](./updating-goldens.html) | The visual-golden update workflow: two golden sets, three update routes, an animated view of the selective CI refresh | [`packages/client-react/tests/ui/visual/UPDATING-GOLDENS.md`](../../packages/client-react/tests/ui/visual/UPDATING-GOLDENS.md) |
| [`aurora-blur-comparison.html`](./aurora-blur-comparison.html) | The live Aurora backdrop (holo-dark skin), with a Current / Reduced / None toggle showing the per-frame GPU cost of the curtain `filter: blur()` — the compositor trap the app removed | [`docs/performance.md`](../performance.md) (trap T6) |
| [`cross-framework-testing.html`](./cross-framework-testing.html) | The one-suite-two-frameworks story: contract swap-trio, assert-only visual tiers, `RTC_CLIENT_PKG` e2e — animated | [`../architecture/21-cross-framework-testing.md`](../architecture/21-cross-framework-testing.md) |
| [`test-bakeoff-outcome.html`](./test-bakeoff-outcome.html) | How the test-tooling bake-off ended: per-category verdicts, the visual-diff bottleneck cut ~52→~15 min, and the coverage-integrity proof | [`../test-bakeoff-outcome.md`](../test-bakeoff-outcome.md) |
| [`rn-visual-goldens-static-fake.html`](./rn-visual-goldens-static-fake.html) | All 21 React Native goldens before and after the harness stopped composing a live simulator: per-scenario device screenshots, measured cross-run drift either side of the change, and the delta that made each golden need re-pinning. The page is image-heavy by nature (~0.8 MB of inlined thumbnails) — it is a contact sheet, so the pictures *are* the content | [`../rn-open-items.md`](../rn-open-items.md) (T46), [`../superpowers/specs/2026-08-11-rn-visual-harness-fake-viewmodel-design.md`](../superpowers/specs/2026-08-11-rn-visual-harness-fake-viewmodel-design.md) |
| [`rn-prototype-fidelity-comparison.html`](./rn-prototype-fidelity-comparison.html) | The React Native client beside the mobile-v1 Claude-design prototype, screen by screen: 18 app-golden / prototype-shot pairs (each app golden framed in its real HUD chrome since PR #588), an eyeballed Close / Moderate / Far verdict per surface with the named deviations, the cross-cutting differences, and the surfaces only one side has. Image-heavy like its sibling above (~1.4 MB of inlined thumbnails) — the pairs *are* the content | [`../design/mobile/v1/reference-shots/DRIFT.md`](../design/mobile/v1/reference-shots/DRIFT.md) (the generated pair table), [`../STATUS.md`](../STATUS.md) (the "RN prototype-fidelity pass" entry), [`../rn-open-items.md`](../rn-open-items.md) (T48) |
| [`machine-boundary-agent-reach.html`](./machine-boundary-agent-reach.html) | Jarvis P5's natural experiment: the app-driving agent's reach turned out to be exactly coextensive with the machine boundary — the `App.tsx` `useState` promotion (before/after code, "two callers, one intent"), the deliberately-kept-unreachable `FxViewProvider` exhibit, and the capability-by-capability PR receipt table (P1→P5) | [`../architecture/18-jarvis-ai-agent-surface.md`](../architecture/18-jarvis-ai-agent-surface.md) §18.17 |

> Since PR #277, `.github/workflows/publish-site.yml` auto-publishes this
> directory: on every push to `main` that touches `docs/showcase/**` (or a
> manual `workflow_dispatch`), it copies the generated `*.html` files here
> (not this README) into `_stage/showcase/`, builds a fresh index over them,
> and pushes the result to the `gh-pages` branch alongside the docs hub and
> the presentation decks — GitHub Pages then serves it from there.
