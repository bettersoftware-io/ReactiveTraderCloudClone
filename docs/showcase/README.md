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

> Nothing here is deployed or built — this directory is outside every CI/deploy
> glob. To share one, open it locally, or publish it deliberately.
