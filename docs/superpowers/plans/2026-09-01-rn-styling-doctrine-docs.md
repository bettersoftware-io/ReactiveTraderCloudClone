# RN Styling Doctrine Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write down the React Native styling doctrine — why CSS Modules cannot exist on native, why `StyleSheet.create` + `useThemedStyles` is the `.module.css` analogue, and which alternatives were considered and deliberately deferred — so the question "doesn't RN have CSS modules?" has a citable answer.

**Architecture:** Docs-only. One new top-level doc (`docs/rn-styling.md`, mirroring the `docs/handler-naming.md` / `docs/performance.md` pattern of "read this before touching X"), one pointer from the codebase map, and two `docs/IDEAS.md` icebox entries for the explicitly kept-open options.

**Tech Stack:** Markdown; `pnpm check:doc-links` gates every relative link + anchor.

**Spec:** Decisions from the 2026-09-01 code-quality audit session: (a) close lint gaps only (companion plan `2026-09-01-inline-style-ban-rn-scope.md`); (b) do **not** adopt a styling library or the `X.styles.ts` split now, but keep both doors open as icebox entries. Facts to encode: RN `src` has 2 literal `style={{…}}` sites (runtime-computed), 76 `StyleSheet.create` blocks in 69 files, `useThemedStyles` in 56 files, and 43 array-form dynamic members `style={[styles.x, { … }]}`.

## Global Constraints

- Work in a worktree via `./scripts/new-worktree.sh <name>`; this plan + the inline-style-ban plan are one reviewable unit if executed together (the ban's message links `docs/rn-styling.md`) — prefer one combined PR.
- Compose any diagram tall, not wide (CLAUDE.md "Markdown Diagrams"); none is expected here.
- Verify anchors with `pnpm check:doc-links` before push.

---

### Task 1: Write `docs/rn-styling.md`

**Files:**
- Create: `docs/rn-styling.md`

**Interfaces:**
- Produces: the doc that `eslint.config.mjs`'s `rnInlineStyleProp` message and `docs/architecture/10-key-design-decisions.md` link to (companion plan).

- [ ] **Step 1: Write the doc with this exact structure and content**

```markdown
# React Native Styling

The web clients ban inline `style={{…}}` and put static styling in co-located
`*.module.css` files. This doc states the native equivalent and why it is not
CSS.

## There is no CSS on native

React Native has no CSS engine: styles are plain JS objects resolved to
native view properties (Yoga for layout). CSS Modules therefore cannot exist
on iOS/Android. Expo's Metro *does* support `.css` and CSS Modules — **web
target only**; on native those imports resolve to empty objects. Any "CSS in
RN" library is an abstraction that compiles down to the same style objects.

## The doctrine

- **Static styling** lives in a `StyleSheet.create` block co-located in the
  component file (69 files do this today) — the `.module.css` analogue.
- **Theme-dependent styling** goes through `useThemedStyles`
  (`src/ui/theme/useThemedStyles.ts`, 56 consumers), never through inline
  conditionals on theme values.
- **Runtime-computed values** (a measured height, an animation progress) use
  the array-form dynamic member: `style={[styles.chart, { height }]}`. This
  is the sanctioned runtime channel — the analogue of the web ban's
  CSS-custom-property exemption. Reanimated styles (`useAnimatedStyle`
  results) pass as array members the same way.
- **Bare `style={{…}}` is banned** by the same ESLint selector as on web
  (`eslint.config.mjs`, RN block) — the fix is one of the three bullets
  above, or the sanctioned
  `// eslint-disable-next-line no-restricted-syntax -- <reason>`.

## Alternatives considered (2026-09-01) and deferred

| option | what it is | why deferred |
|---|---|---|
| Sibling `X.styles.ts` files | move each `StyleSheet.create` to a sibling module, mirroring `.module.css` co-location | cosmetic symmetry only; 69-file churn with no behavioural gain — icebox |
| react-native-unistyles | C++ shadow-tree styling, themes/breakpoints | new native dep for a solved problem — icebox |
| react-strict-dom | Meta's StyleX-like `css.create`, one API for web+native | young; would compete with the established `.module.css` setup on web — icebox |
| NativeWind / Tamagui / styled-components | utility- or DSL-driven styling | different design language than the token/skin system |

Deferred ≠ rejected: the first three are recorded in
[`IDEAS.md`](IDEAS.md) and can graduate later.
```

Adjust the relative link if IDEAS.md's real anchor differs.

- [ ] **Step 2: Verify**

Run: `pnpm check:doc-links`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add docs/rn-styling.md
git commit -m "docs: RN styling doctrine — StyleSheet.create is the module.css analogue"
```

### Task 2: Pointer from the codebase map

**Files:**
- Modify: `docs/architecture/13-codebase-map.md` (the `client-react-native` section — locate with `grep -n "client-react-native" docs/architecture/13-codebase-map.md | head -3`)

- [ ] **Step 1: Add one sentence**

In the RN package's paragraph, append: `Styling doctrine (no CSS on native; StyleSheet.create + useThemedStyles; array-form runtime channel): see [rn-styling.md](../rn-styling.md).` — adjusting the relative path to the file's location.

- [ ] **Step 2: Verify + commit**

Run: `pnpm check:doc-links` → exit 0.

```bash
git add docs/architecture/13-codebase-map.md
git commit -m "docs: point the codebase map at the RN styling doctrine"
```

### Task 3: Icebox entries for the kept-open options

**Files:**
- Modify: `docs/IDEAS.md` (add under a fitting heading; `## Tooling & workflow` exists at line ~46, or add a `## Mobile` heading if none fits)

- [ ] **Step 1: Add two entries**

```markdown
- **RN sibling `X.styles.ts` split** — move each component's `StyleSheet.create`
  block to a sibling `X.styles.ts`, mirroring the web clients' `.module.css`
  co-location. Cosmetic symmetry; 69 files. Deliberately deferred 2026-09-01
  (chose lint-gaps-only) — see `docs/rn-styling.md`.
- **RN styling library evaluation** (react-native-unistyles / react-strict-dom)
  — only worth revisiting if a real limitation of `StyleSheet.create` +
  `useThemedStyles` appears (e.g. web+native single-source styling). Deferred
  2026-09-01 — see `docs/rn-styling.md`.
```

- [ ] **Step 2: Verify + commit + ship**

Run: `pnpm check:doc-links` → exit 0. Then commit and (if executed standalone) push/PR/CI/merge per shipping-repo-changes:

```bash
git add docs/IDEAS.md
git commit -m "docs: icebox the deferred RN styling options"
```
