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

> Since PR #277, `.github/workflows/publish-site.yml` auto-publishes this
> directory: on every push to `main` that touches `docs/showcase/**` (or a
> manual `workflow_dispatch`), it copies the generated `*.html` files here
> (not this README) into `_stage/showcase/`, builds a fresh index over them,
> and pushes the result to the `gh-pages` branch alongside the docs hub and
> the presentation decks — GitHub Pages then serves it from there.
