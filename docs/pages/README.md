# Project site (`gh-pages`)

GitHub Pages serves this repo's site from the **`gh-pages` branch** (Settings →
Pages → *Deploy from a branch* → `gh-pages` / root). The branch is a pure
deployment artifact — never edit it by hand.

## Layout & ownership

| Path on `gh-pages`      | Owner                                   |
|-------------------------|-----------------------------------------|
| `/index.html`, `.nojekyll` | this folder (`docs/pages/`)          |
| `/presentations/**`     | `.github/workflows/publish-site.yml`    |
| `/coverage/**`          | `.github/workflows/coverage-report.yml` |

Each producer writes only its own subtree via
`scripts/pages/publish-to-pages.mjs`, which replaces its top-level entries and
preserves the others — so the two never clobber each other.

## Add a presentation

Commit the deck to `main` under a dated folder:

```
docs/presentations/<YYYY-MM-DD>/<Nice-File-Name>.html   (+ .pdf, both LFS-tracked)
```

On push to `main`, `publish-site.yml` republishes all decks and regenerates the
index. The display title comes from the **filename** (`Nice-File-Name` →
"Nice File Name"), the date from the folder.

## One-time setup (maintainer)

Flipping the Pages source is a Pages-admin action the repo PAT cannot perform:
**Settings → Pages → Source → Deploy from a branch → `gh-pages` / (root)**.
