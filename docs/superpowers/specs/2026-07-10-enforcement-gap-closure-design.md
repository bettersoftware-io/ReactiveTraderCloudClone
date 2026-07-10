# Enforcement Gap Closure — making the Atlas's boundary claims machine-checked

- **Date:** 2026-07-10
- **Status:** Approved (user-validated design, this session)
- **Origin:** The Codebase Atlas (PR #151) documented three enforcement gaps
  honestly instead of overclaiming. This workstream closes the two that are
  cheap and real, corrects the one that was working-as-intended, and plans
  (without implementing) the refactor that would make test-ID renames atomic.
- **Related:** `docs/architecture/12-architectural-gates.md`,
  `docs/dependency-cruiser.md`, `packages/client-core/README.md`,
  `packages/client-react-native/README.md`, `docs/architecture/16-trailheads.md`.

## 1. Problem

The Atlas states several architectural boundaries that today rest on
package.json structure and honesty rather than CI:

1. `.dependency-cruiser.cjs` has pair rules for only 5 of 9 packages —
   `client-core`, `react-bindings`, `client-react-native`, and
   `client-prototype` have none.
2. The RN dumb-UI boundary (`client-react-native/src/ui`) has no grep gates;
   the web client's gates 26–29 police only `client-react/src/ui`.
3. Gate 1 ("no raw data-testid literals") polices only the `tests/` tree —
   flagged in the docs as a gap, but investigation shows this is by design:
   components are the *definition site* (156 web `data-testid=` + 91 RN
   `testID=` literals), tests are the *consumption site* guarded through the
   `TESTIDS` registry, and definition/registry drift is caught loudly by
   failing tests. The airtight alternative (atomic renames) is a ~247-site
   refactor plus a registry-relocation decision — worth planning, not worth
   doing now.

Verified baseline (2026-07-10): all rules and gates proposed below pass on
today's tree with zero violations. This PR codifies; it does not fix code.

## 2. Deliverables

### PR A (this branch) — enforcement + doc truth-up

**2.1 Dependency-cruiser pair rules** — append to `forbidden` in
`.dependency-cruiser.cjs`, following the existing rule style (name, severity
error, comment, from/to path regexes):

| Rule name | from | to (forbidden) |
|---|---|---|
| `client-core-stays-inner` | `^packages/client-core/src` | `^packages/(react-bindings\|client-react\|client-react-native\|client-prototype\|server)/` |
| `client-core-framework-free` | `^packages/client-core/src` | resolved module path matching `node_modules/(react\|react-dom\|react-native)(/\|$)` — verify dependency-cruiser's matching form against its docs during implementation; if npm-module matching proves unreliable, drop THIS rule only and keep the boundary documented as structural (do not ship a rule that can't be violation-probed) |
| `react-bindings-no-apps` | `^packages/react-bindings/src` | `^packages/(client-react\|client-react-native\|client-prototype\|server)/` |
| `clients-never-import-each-other` | `^packages/(client-react\|client-react-native\|client-prototype)/src` | the other two clients (implement as one rule with a group-reference or as per-client rules — whichever dependency-cruiser expresses cleanly; all six directed pairs must be covered) |
| `prototype-isolated` | `^packages/client-prototype/src` | `^packages/(domain\|shared\|client-core\|react-bindings\|client-react\|client-react-native\|server\|ws-effects)/` |

Note `clients-never-import-each-other` overlaps `prototype-isolated` for the
prototype directions — acceptable; clarity over minimality, matching how
`domain-stays-pure` and `shared-no-apps` already overlap conceptually.

**2.2 RN dumb-UI grep gates 30–33** — append to `tests/scripts/grep-gates.ts`
mirroring gates 26–29 exactly, with paths
`../packages/client-react-native/src/ui/`:

- 30: no `rxjs` / `@react-rxjs` / `@rx-state` imports (only the bindings
  bridge may touch streams)
- 31: no `localStorage` / `AsyncStorage` (persistence belongs behind
  `PreferencesPort`)
- 32: no `fetch(` / `import.meta.env` / `expo-constants` reads (transport &
  config belong in the app layer) — mirror gate 28's pattern, adding the RN
  config-access equivalent only if a probe shows the pattern is expressible
  without false positives; otherwise ship the literal gate-28 mirror
- 33: no `setTimeout` / `setInterval` (time belongs in machines/presenters)

Follow gate 29's custom-check structure where 26–28's simple pattern form
doesn't fit. Numbering continues from 29; no renumbering of existing gates.

**2.3 Documentation truth-up** (the docs currently *understate* enforcement
once 2.1/2.2 land, and *overstate* the gate-1 gap):

- `docs/architecture/12-architectural-gates.md`: add rows 30–33; update the
  closing "Gates 26–29 are the machine-readable definition of dumb UI"
  paragraph to cover both clients.
- `docs/dependency-cruiser.md`: rewrite the "Scope note" that admits the
  missing pair rules; document the new rules in the rule table/prose.
- `packages/client-core/README.md` identity card: "There is no single named
  grep-gate for this rule" → cite `client-core-stays-inner` (+
  `client-core-framework-free` if shipped).
- `packages/client-react-native/README.md` identity card: "No gate
  mechanically enforces this here" → cite gates 30–33.
- `docs/architecture/16-trailheads.md`: gate-1 side-note reworded to the
  by-design rationale (definition site vs registry-guarded consumption site;
  drift fails tests loudly) + pointer to the atomic-renames plan (2.4). Recipe
  4's checklist gains gates 30–33 for the RN panel path; recipe 5's
  dep-cruiser caveat updated (pair rules now cover all 9 packages).
- `docs/architecture/13-codebase-map.md`: L1 cards' "non-obvious"/boundary
  facts that mention missing enforcement (client-core, prototype, RN)
  updated to cite the new rules/gates.
- `CLAUDE.md`: no change needed (it doesn't enumerate gates).

**2.4 Cross-reference:** every doc edit that touches the gate-1 story links
to the PR-B plan location (`docs/superpowers/plans/2026-07-10-atomic-testid-renames.md`).

### PR B (separate branch) — atomic test-ID renames, plan only

Docs-only deliverable in the established plan-now-execute-later pattern
(power-saver PR #140, feature-flags PR #83):

- `docs/superpowers/specs/2026-07-10-atomic-testid-renames-design.md` —
  covers: the registry-relocation decision (options: new tiny `@rtc/testids`
  package · fold into `@rtc/shared` · keep in `tests` and accept a
  `packages → tests` dep is forbidden, hence relocation is required; the spec
  must pick one with rationale — default recommendation: new dev-only
  `@rtc/testids` package, since `shared` is a *runtime* boundary-DTO package
  and test markers are not wire contracts), the web + RN literal-migration
  approach (156 `data-testid` + 91 `testID` sites), gate-1 scope extension to
  `packages/*/src`, and the golden/visual impact statement (none expected —
  testids don't render).
- `docs/superpowers/plans/2026-07-10-atomic-testid-renames.md` — bite-sized
  task plan per the writing-plans skill, executable by a future SDD session
  without this session's context.
- NOT implemented now. The plan documents explicitly carry the "MERGED AS
  PLAN, NOT EXECUTED" banner convention used by the power-saver plan.

## 3. Verification (PR A)

1. **Violation probes** — for every new dep-cruiser rule and grep gate: add a
   deliberate violation (temp import / temp forbidden line), observe the
   named rule/gate fail, revert, observe green. Record each probe's output in
   the task report. A rule that cannot be made to fail is not shipped.
2. `pnpm check:deps` green; the gates script green (run the same command CI's
   "Architecture + supply-chain gates" step runs — read `.github/workflows/ci.yml`
   for the exact invocation).
3. Full gauntlet (biome, both eslint configs, actionlint, check:scripts,
   knip, typecheck, tests) + `pnpm check:doc-links`.
4. Acceptance: all 9 packages named by at least one dep-cruiser pair rule;
   both clients' `src/ui` covered by equivalent gate sets; zero doc sentences
   remaining that describe the closed gaps as open (grep for the exact
   phrases being replaced).

## 4. Out of scope

- Executing the atomic-renames migration (PR B is plan-only).
- Gate 1's `tests/`-tree behaviour (unchanged).
- Any component/UI code changes; both PR A rule sets pass on today's tree.
- Extending gates to `client-prototype` (design island, no boundary to police
  beyond `prototype-isolated`).
