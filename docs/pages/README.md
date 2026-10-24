# Project site (`gh-pages`)

GitHub Pages serves this repo's site from the **`gh-pages` branch** (Settings →
Pages → *Deploy from a branch* → `gh-pages` / root). The branch is a pure
deployment artifact — never edit it by hand.

## Layout & ownership

| Path on `gh-pages`      | Owner                                   |
|-------------------------|-----------------------------------------|
| `/index.html`, `.nojekyll` | this folder (`docs/pages/`)          |
| `/presentations/**`     | `.github/workflows/publish-site.yml`    |
| `/showcase/**`          | `.github/workflows/publish-site.yml`    |
| `/coverage/**`          | `.github/workflows/coverage-report.yml` |
| `/visual/**`            | `.github/workflows/visual.yml`          |

Each producer writes only its own subtree via
`scripts/pages/publish-to-pages.mts`, which replaces its top-level entries and
preserves the others — so they never clobber each other.

The branch keeps **no history**: every publish replaces it with a single
parentless commit of the merged tree (Pages serves only the tip; appending a
commit per publish had grown the repository by ~266 MB). The force-push carries
a lease on the tip the tree was built from, so a producer that published in
between is never overwritten — the loser rebuilds on the new tip and retries.
Old reports are therefore not recoverable from the branch; each producer's
workflow run is the record.

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
