[◀ Visual tests README](./README.md) · [ADR-001 — why two sets](./ADR-001-visual-diff-tooling.md) · [Test strategy §9.7](../../../../../docs/architecture/09-test-strategy.md#97-visual-golden-tiers) · [Repo root](../../../../../README.md)

# Updating the visual goldens

The operational runbook: which command to run when a screenshot test goes red or
you add a new one. If you only remember one thing:

> There are **two golden sets** (not one), and **three routes** to update them.
> A deliberate UI change usually means refreshing **both** sets — via two routes.

For *why* two sets exist (and why we did **not** collapse to one), see
[ADR-001 → "Cross-platform pixel drift"](./ADR-001-visual-diff-tooling.md). This
file is the *how*.

> **Prefer an interactive view?** A self-contained, animated companion to this
> runbook lives at
> [`docs/showcase/updating-goldens.html`](../../../../../docs/showcase/updating-goldens.html)
> — open it in a browser. The markdown here is authoritative; that page is the
> visual twin.

---

## Where you are

```mermaid
flowchart TB
    ROOT["README.md · docs/architecture/09-test-strategy.md<br/>the test strategy"]
    VIS["tests/ui/visual/README.md<br/>the visual tier: layout, 3 runners, ADR"]
    HERE["UPDATING-GOLDENS.md<br/>▶ you are here — the update runbook"]
    ROOT --> VIS --> HERE
```

## The two sets

They render the same scenarios but live in different worlds. Font rasterization
drifts ~30% across CPU architectures, so an arm64 Mac cannot reproduce x86
pixels natively — hence one set per world. Which set a given run reads and writes
is decided purely by the `CI` env var:

```mermaid
flowchart TB
    RUN["a visual test runs"] --> Q{"CI env set?"}
    Q -->|"CI=1 · container / visual.yml"| RCI["react/<br/>canonical x86 · gates on push to main"]
    Q -->|"unset · your machine"| RLOC["react-local/&lt;arch&gt;<br/>native pixels · fast loop · never gates"]
```

| Set | What it is | Gates? | Rendered where | Baseline when |
|---|---|---|---|---|
| **`__screenshots__/react/`** | The canonical **x86** baseline. The cross-framework contract `@rtc/client-solid` also asserts against. | ✅ **`visual.yml` on push to `main`** | pinned Playwright container (`v1.61.0-noble`) | `CI=1` |
| **`__screenshots__/react-local/<arch>/`** | Your machine's **native** pixels (`darwin-arm64`, `linux-arm64`). Powers the instant local loop. | ❌ never — feedback only | your machine, no Docker | `CI` unset |

A plain local run (no `CI`) reads/writes `react-local/<arch>`; CI reads/writes
`react/`. **A deliberate UI change therefore invalidates both.**

## The three routes

| # | Route | Updates | Selective? | Who commits |
|---|---|---|---|---|
| **1** | **CI workflow** — dispatch `update-visual-goldens.yml` | `react/` | ✅ `scenario_pattern` | **CI auto-commits & pushes** to your branch |
| **2** | **Local Docker** — `pnpm goldens:regen` / `goldens:verify` | `react/` | ❌ full-set only *(today — see gaps)* | **you** (writes to working tree) |
| **3** | **Local native** — `pnpm test:ui:visual:<tier>:react:update` | `react-local/<arch>` | ✅ `SCENARIO_PATTERN` env | **you** — no Docker, instant |

Routes **1 and 2 produce the byte-identical `react/` set** — pick 1 to let CI do
the compute and push for you, or 2 to do it locally with no round-trip. Route 3
is separate: it keeps *your machine's* fast-feedback set in sync.

```mermaid
flowchart TB
    R1["Route 1 · CI workflow<br/>update-visual-goldens.yml<br/>selective · CI auto-commits"]
    R2["Route 2 · local Docker<br/>goldens:regen / verify<br/>full-set today · you commit"]
    R3["Route 3 · native :update<br/>SCENARIO_PATTERN · instant · no Docker<br/>you commit"]
    RCI["react/ (canonical x86)"]
    RLOC["react-local/&lt;arch&gt;"]
    R1 --> RCI
    R2 --> RCI
    R3 --> RLOC
    RCI --> GATE["visual.yml gate · push to main"]
    RLOC --> LOOP["pnpm test:ui:visual · local loop"]
```

### Route 1 — selective CI refresh (and it commits for you)

The lever that killed the old "regenerate everything for one changed pixel"
bottleneck. An empty pattern does a full wipe + re-render (~all scenarios × 3
tiers, ~30 min); a pattern re-renders **only matching scenarios, no wipe**
(~1 min), then CI commits the result back to your branch with `[skip ci]`.

```mermaid
sequenceDiagram
    participant You
    participant GH as GitHub Actions
    participant Runner as pinned x86 container
    participant Branch as your branch
    You->>GH: dispatch (scenario_pattern="aurora")
    GH->>Runner: render only matching scenarios × 3 tiers
    Runner-->>GH: new / updated react/ PNGs
    GH->>Branch: commit "[skip ci]" + push
    Note over Branch: react/ refreshed — no round-trip
```

```bash
# From the Actions tab: "Update visual goldens" → Run workflow → set scenario_pattern.
# Or from the CLI:
gh workflow run "Update visual goldens" --ref my-branch -f scenario_pattern=aurora
```

The pattern is a test-title regex (Playwright `-g` / Vitest `-t`) — a component
name usually matches several scenarios at once (e.g. `credit` matches every
Credit scenario). The auto-commit stages the whole `…/__screenshots__/react`
tree, so **new** golden files are committed too, not just changed ones.

### Route 2 — local Docker regen / verify

The same pinned image under `--platform linux/amd64` reproduces CI's x86 pixels
byte-for-byte, so any machine with Docker can produce or check `react/` locally.

```mermaid
sequenceDiagram
    participant You
    participant Container as pinned x86 container
    participant Tree as your working tree
    You->>Container: pnpm goldens:regen (CI=1 · --platform linux/amd64)
    Container->>Container: render all scenarios × 3 tiers
    Container-->>Tree: write react/ (byte-identical to CI)
    You->>Tree: review & commit
    Note over You,Tree: goldens:verify asserts react/ instead of writing — a CI-exact local gate
```

```bash
pnpm goldens:regen    # rewrite react/ into the working tree — review & commit
pnpm goldens:verify   # assert the committed react/ set passes (a CI-exact gate)
```

Use `goldens:verify` to reproduce CI's visual gate on your own machine **before**
pushing — it's the only local way to prove `react/` is green without waiting for
`visual.yml`. Requires the Docker daemon; first run is slower (image pull +
amd64 install under emulation), later runs reuse the layer + a persistent pnpm
store. **Full-set only today** (~20–30 min) — see [gaps](#known-gaps).

### Route 3 — local native (fast inner loop)

Plain Playwright / Vitest on your host, writing your native `react-local/<arch>`
set. Instant, no container. Run it after a deliberate UI change so
`pnpm test:ui:visual` goes green again locally.

```mermaid
sequenceDiagram
    participant You
    participant Host as your machine (no Docker)
    You->>Host: pnpm ...:react:update (CI unset · optional SCENARIO_PATTERN)
    Host->>Host: render natively
    Host-->>You: write react-local/&lt;arch&gt;
    Note over You,Host: pnpm test:ui:visual is green locally again — commit the local set
```

```bash
# one tier:
pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update
# tiers: playwright · playwright-ct · vitest-browser

# narrow to matching scenarios (already supported — same env the CI workflow uses):
SCENARIO_PATTERN=aurora \
  pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update
```

---

## Your three everyday situations

### A · A snapshot went red and it caught a real regression

Your change broke the UI; the golden did its job. **Fix the bug. Touch no
goldens.** No route needed — the red is correct, and it should go green once the
bug is fixed.

```mermaid
sequenceDiagram
    participant You
    participant Tests as visual tests
    participant Golden as committed golden
    You->>Tests: change UI (unintended break)
    Tests->>Golden: compare render vs golden
    Golden-->>Tests: mismatch
    Tests-->>You: RED — regression caught
    You->>You: fix the bug (do NOT touch goldens)
    Tests-->>You: GREEN again
```

### B · You made a deliberate UI change, so some snapshots *should* change

This is Route 1's home turf — with one wrinkle: `visual.yml` runs **post-merge
on `main`, not on PRs**, so you find out *which* scenarios moved from your own
machine, not from a PR check.

1. **Learn what changed** — run Route 3 native locally. The diff names the
   affected scenarios.
2. **Refresh your local set** — the same Route 3 `:update` run writes
   `react-local/<arch>`. Commit it.
3. **Refresh the canonical set** — dispatch **Route 1** with a `scenario_pattern`
   covering those scenarios (CI renders + commits `react/`), **or** run **Route 2**
   `pnpm goldens:regen` locally.
4. **(Optional) prove it** — `pnpm goldens:verify` reproduces CI's exact gate
   before you push.

```mermaid
sequenceDiagram
    participant You
    participant Native as Route 3 (native)
    participant CI as Route 1 (workflow)
    You->>Native: run :update — learn which scenarios moved
    Native-->>You: react-local/&lt;arch&gt; refreshed → commit
    You->>CI: dispatch scenario_pattern = those scenarios
    CI-->>You: react/ regenerated & pushed to your branch
    Note over You,CI: both sets updated — visual.yml stays green on main
```

### C · You added a brand-new component / scenario (no golden exists yet)

**Route 1's pattern handles new snapshots — you do *not* need the slow local
Docker.** `--update` *writes missing* goldens, and the auto-commit stages a
directory, so new files are picked up. The one prerequisite: the new scenario
must be **registered on your branch first** — the `scenarios.ts` /
`scenarioActions.ts` / registry edits (see the "add a scenario" recipe in
[ADR-001](./ADR-001-visual-diff-tooling.md)). CI renders what the code defines.

```bash
# after pushing the scenario definition to your branch:
gh workflow run "Update visual goldens" --ref my-branch -f scenario_pattern=my-new-scenario
```

Then run Route 3 native locally to add the same new scenario to your
`react-local/<arch>` set.

```mermaid
sequenceDiagram
    participant You
    participant Branch as your branch
    participant CI as Route 1 (workflow)
    You->>Branch: register scenario (scenarios.ts + registry) then push
    You->>CI: dispatch scenario_pattern = my-new-scenario
    CI->>CI: --update writes the MISSING react/ goldens
    CI-->>Branch: auto-commit the new PNGs
    Note over You,Branch: then run Route 3 native to add it to react-local/&lt;arch&gt;
```

---

## Which do I run?

| Situation | Route |
|---|---|
| Red snapshot caught a real bug | **none** — fix the bug (situation A) |
| Local `pnpm test:ui:visual` is red, nothing to push yet | **3** (native, instant) |
| Deliberate UI change — refresh both sets | **3** + (**1** or **2**) |
| A few scenarios changed; let CI regen & commit `react/` | **1** (selective) |
| Refresh `react/` locally / reproduce a CI visual failure | **2** (`goldens:regen` / `goldens:verify`) |
| New scenario, no golden yet | **1** (pattern; register the scenario first) + **3** for local |

> **The trap:** updating only `react-local` (Route 3) and assuming CI is happy.
> CI checks `react/`, which Route 3 never touches — refresh it via Route 1 or 2,
> or `visual.yml` reddens on the next push to `main`.

---

## Known gaps

- **Route 2 is not selective yet.** `goldens-in-container.mjs` doesn't forward
  `SCENARIO_PATTERN` into the container, so `pnpm goldens:regen` always renders
  the full set (~20–30 min) — exactly where selectivity would help most.
  Tracked in [docs/STATUS.md](../../../../../docs/STATUS.md).
- **Route 3 selectivity is undocumented, not unbuilt.** All three native configs
  already read `SCENARIO_PATTERN` (shown above); the only possible addition is a
  friendlier wrapper script. Also tracked in STATUS.md.

## Reference

| File | Role |
|---|---|
| [`.github/workflows/update-visual-goldens.yml`](../../../../../.github/workflows/update-visual-goldens.yml) | Route 1 — dispatch, filter, auto-commit |
| [`scripts/goldens-in-container.mjs`](../../../../../scripts/goldens-in-container.mjs) | Route 2 — regen / verify wrapper |
| `packages/client-react/package.json` → `test:ui:visual:*` | Route 3 — native `:update` scripts |
| `tests/ui/visual/*/​*.config.ts` | baseline routing · `SCENARIO_PATTERN` filter |
| [`ADR-001-visual-diff-tooling.md`](./ADR-001-visual-diff-tooling.md) | why two sets exist; the collapse that was reverted |
| [`.github/workflows/visual.yml`](../../../../../.github/workflows/visual.yml) | the gate — checks `react/` on push to `main` |

Container image is pinned to `mcr.microsoft.com/playwright:v1.61.0-noble`;
tolerance is `maxDiffPixelRatio: 0.06`; three tiers: `playwright`,
`playwright-ct`, `vitest-browser`. Keep the image tag identical across
`ci.yml`, `visual.yml`, `update-visual-goldens.yml`, and
`scripts/goldens-in-container.mjs` (the `check:image-tag-drift` gate enforces
this).
