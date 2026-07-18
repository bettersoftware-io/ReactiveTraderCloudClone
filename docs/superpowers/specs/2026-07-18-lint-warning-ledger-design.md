# Lint-warning ledger with CI drift-gate — Design

**Date:** 2026-07-18
**Status:** Approved (brainstorm), pending spec review

## Problem

Lint *warnings* (as opposed to errors) are non-blocking by design in this repo —
`biome ci` and CI gate on errors only, and ESLint warnings never fail a build.
That is deliberate, but it has a failure mode: a warning can be introduced and
then linger indefinitely because nothing tracks it and nothing forces a
decision. Today there are 11 `solid/reactivity` warnings in
`packages/client-solid` that have accreted exactly this way.

We want warnings to be **impossible to introduce untracked**, and every
outstanding warning to be a **visible, dated to-do** that stays on the books
until the underlying warning is fixed — without converting warnings to errors
(which would defeat the repo's intentional warnings-are-advisory stance).

## Approach

Reuse the repo's established **committed-artifact + `check:*-drift` CI gate**
pattern (the same shape as `check:manifest-drift`, `check:doc-links`,
`check:devtools-dist`):

- A machine-generated ledger of every current lint warning is **committed** to
  the repo.
- CI regenerates the ledger from scratch and **fails if the committed copy is
  stale**. So introducing a new warning without recording it turns CI red; the
  author must either fix the warning or run the sync script to record it. Either
  way the warning cannot land silently.
- A local npm script regenerates the ledger on demand.

This puts enforcement at the PR gate (where all contributors and CI pass
through), not in a per-session Stop hook. Warnings stay non-blocking as code;
what becomes blocking is *letting the ledger drift out of sync*.

## Components

### 1. `scripts/sync-lint-warnings.mjs`

Collector. Runs ESLint over the repo with **both** configs
(`eslint.config.mjs` and `eslint.config.typed.mjs`) using `-f json`, filters to
`severity === 1` (warn), de-dupes across the two configs, and writes
`docs/lint-warnings.md`. Invoked by `pnpm sync:lint-warnings`.

Reuses the same ESLint invocation the repo already runs for `lint:eslint` /
`lint:eslint:types` so the warning set is identical to what CI's lint jobs see.

### 2. `docs/lint-warnings.md` (the ledger)

Committed, machine-generated. Grouped by **rule**, then by **file**, each entry
carrying the warning **message** and an **occurrence count**. A header notes it
is generated and must be regenerated via `pnpm sync:lint-warnings` (never edited
by hand). Seeded with the current 11 `solid/reactivity` entries.

**Canonical key excludes line numbers.** The stable fingerprint per warning is
`(rule, file, message, count)`. Rationale: if the ledger stored `file:line`,
any edit that shifts lines above a warning would flip the drift-gate red on an
unrelated change — pure noise. The ESLint message already embeds the offending
identifier (e.g. `"The reactive variable 'tradeIdsKey' should be…"`), so
distinct warnings remain distinct, moving code never false-triggers, and a
genuinely new warning adds a new tuple (or increments a count) → real drift.
Whoever fixes a warning locates it by file + the identifier in the message.

Entries are emitted in a **deterministic sort order** (rule, then file, then
message) so regeneration is byte-stable regardless of ESLint's traversal order.

### 3. `scripts/check-lint-warnings-drift.mjs`

Gate. Regenerates the canonical ledger in memory and compares it to the
committed `docs/lint-warnings.md`. On match: exit 0. On mismatch: print a diff
summary + `run \`pnpm sync:lint-warnings\` and commit the result`, exit 1. A
near-clone of `check-manifest-drift.mjs`. Invoked by
`pnpm check:lint-warnings-drift`.

### 4. npm scripts + CI wiring

- `sync:lint-warnings` → `node scripts/sync-lint-warnings.mjs`
- `check:lint-warnings-drift` → `node scripts/check-lint-warnings-drift.mjs`
- The `check:lint-warnings-drift` gate is added to CI (`.github/workflows/ci.yml`)
  in the same job/step group as the other `check:*` drift gates, so it runs on
  PR + push-to-main like the rest.

### 5. `docs/STATUS.md` pointer

A single line under **⚪ Optional / next step** pointing at
`docs/lint-warnings.md` and naming the current outstanding count, so the
warning backlog is discoverable from the curated cross-workstream backlog
without bloating it with per-warning entries.

## Explicitly out of scope

- **Not converting warnings to errors, and no hard count-ratchet.** The gate
  enforces *visibility/tracking*, not *fixing*; it must not block an unrelated
  PR merely for adding a warning (only for failing to record it). A future
  tightening could add a monotonic-decreasing count budget (a "warning ratchet")
  once the current backlog is drained — noted here as a possible follow-up, not
  built now.
- **Not fixing the 11 `solid/reactivity` warnings.** They live in the
  visual-golden-backed Solid client and are semantic reactivity calls; fixing
  needs care and is its own tracked task. This change *records* them and is what
  drives the eventual cleanup.
- **No Stop hook.** CI is the single enforcement point.
- **No separate user-invocable skill.** The npm script + CI gate carry the
  mechanism; documented in CLAUDE.md. A skill can be added later if invoking by
  name proves useful.

## Testing

- Unit: `scripts/sync-lint-warnings.mjs` and the drift checker parse a fixed
  ESLint-JSON fixture into the expected canonical ledger (deterministic output;
  line-number independence; cross-config de-dupe).
- Integration: after seeding `docs/lint-warnings.md`, `pnpm
  check:lint-warnings-drift` exits 0; deleting one ledger entry makes it exit 1;
  regenerating restores 0.
- The full gauntlet (biome/eslint/typecheck) stays green; the new scripts are
  JS tooling covered by the repo's existing root-`.mjs` lint include.

## Rollout

Its own branch/PR, separate from the lint-padding rule PR (#243). Seed the
ledger, wire the gate, add the STATUS pointer; merge when green.
