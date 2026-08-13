# Prefs ModalShell/Content Split + Force-Boot-Animation Default Flip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip `DEFAULT_FORCE_BOOT_ANIMATION` to `true`, and split `PreferencesModal` into a reusable `ModalShell` + `PreferencesContent` in both web clients so a new `prefs/content` visual scenario pixel-asserts every row (today the JARVIS section + Login wait delay are clipped below the 86vh fold).

**Architecture:** Pure-refactor split — the shell chrome (overlay / draggable dialog / header / scrollable clamped body / footer) moves to `src/ui/shell/modal/ModalShell` in each client; the two-column grid keeps its `useViewModel()` wiring in a new `PreferencesContent`; `PreferencesModal` becomes a thin composition. All testids and rendered DOM stay identical, so the contract + e2e tiers need zero changes and the existing `prefs/modal` golden changes only via the Part-A toggle flip. Spec: [../specs/2026-08-12-prefs-modal-shell-split-and-boot-default-design.md](../specs/2026-08-12-prefs-modal-shell-split-and-boot-default-design.md)

**Tech Stack:** React 19 + SolidJS clients, CSS Modules, `@rtc/ui-contract` scenario matrix, Playwright golden tier.

## Global Constraints

- Repo rules apply: Biome format + import-sort (`biome ci .`), mandatory braces, `#/` subpath imports, no inline `style={{…}}` in `src/` (the visual-test registries in `tests/` are exempt — they already use style objects), handler naming by effect (`docs/handler-naming.md`), newspaper order.
- **Testids must not change:** `prefs-modal`, `prefs-close`, `prefs-done`, `prefs-column`, every `pref-toggle-*` / `pref-segment-*`.
- **The Solid split must reproduce the React DOM shape exactly** (same element-per-class structure) — goldens are react-authored, solid-asserted.
- The worktree is `.claude/worktrees/prefs-shell-split` (branch `worktree-prefs-shell-split`); all commands below run from its root. Run `pnpm install` once, then `pnpm build` before any visual-tier work.
- Shell is zsh: never use `status` as a variable name in loops (read-only builtin); use `st`.

---

### Task 1: Part A — flip `DEFAULT_FORCE_BOOT_ANIMATION` to `true`

**Files:**
- Modify: `packages/domain/src/preferences/preferences.ts:161-163`
- Modify: `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts:216-234`
- Modify: `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.test.ts:101-119`
- Modify: `packages/ui-contract/src/shared/harness/world.ts:875-877`
- Modify: `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts:277-283`
- Modify: `packages/client-solid/tests/ui/visual/solid/buildFakeViewModel.ts:313` (same shape as react's)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `DEFAULT_FORCE_BOOT_ANIMATION = true` (same export name/type); all fakes/harnesses default the toggle ON, which Task 4's golden regen depends on.

- [ ] **Step 1: Flip the port-contract default assertion first (the failing test)**

In `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts`, the two `forceBootAnimation` cases become:

```ts
    it("empty store emits the default forceBootAnimation=true", async () => {
      const port = makeEmpty();
      expect(await firstValueFrom(port.forceBootAnimation$())).toBe(true);
    });

    it("setForceBootAnimation persists and pushes to existing subscribers", () => {
      // (unchanged body — it seeds nothing and toggles explicitly)
    });

    it("reads back a seeded forceBootAnimation", async () => {
      const port = makeSeeded({ forceBootAnimation: false });
      expect(await firstValueFrom(port.forceBootAnimation$())).toBe(false);
    });
```

The seeded test flips its seed to `false` so it still proves a **non-default** value survives the round-trip. Check the middle test's body — if it asserts a `[false, true]` emission sequence starting from the old default, invert it to `[true, false]` (it must start from the new default and toggle away).

- [ ] **Step 2: Run the contract to verify it fails**

Run: `pnpm --filter @rtc/domain test -- PreferencesPort`
Expected: FAIL — `expected false to be true` on the empty-store case (the contract also runs inside react/solid/RN adapter packages; those fail later the same way until Step 3 lands).

- [ ] **Step 3: Flip the constant + rewrite its rationale comment**

In `packages/domain/src/preferences/preferences.ts` replace lines 161-163:

```ts
/** Force the boot-splash animation to play even under prefers-reduced-motion.
 * Default true — showcase posture: the boot splash is part of the product
 * identity, so it plays unless the user opts out via this preference.
 * Reduced-motion users regain suppression by turning the toggle off; power-
 * saver Freeze still unconditionally skips the boot canvas regardless of this
 * value, and the webdriver/?nosplash automation gate is a separate layer. */
export const DEFAULT_FORCE_BOOT_ANIMATION = true;
```

- [ ] **Step 4: Sweep every other test/fake asserting the old default**

```bash
grep -rn "forceBootAnimation" packages --include="*.ts" --include="*.tsx" \
  | grep -v dist | grep -v node_modules | grep -iv "setForceBootAnimation"
```

Known hits to fix (fix any others the grep surfaces the same way):

1. `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.test.ts:101` — rename to `"emits the default forceBootAnimation (true) synchronously"`, assert `toBe(true)`; the hydration test at line 107 seeds a stored value — flip its stored value to `false` (and its assertion) if it currently stores `true` (a stored value equal to the new default would emit no second value and hang the `skip(1)` pipe).
2. `packages/ui-contract/src/shared/harness/world.ts:875-877` — the fake world's default seed. Import the constant so it can never drift again:

```ts
  const forceBootAnimation = new BehaviorSubject<boolean>(
    forceBootAnimationSeed ?? DEFAULT_FORCE_BOOT_ANIMATION,
  );
```

Add `DEFAULT_FORCE_BOOT_ANIMATION` to the existing `@rtc/domain` import in that file.
3. Both visual fakes (`buildFakeViewModel.ts`, react line 277 / solid line 313):

```ts
    useForceBootAnimation: () => {
      return {
        enabled: DEFAULT_FORCE_BOOT_ANIMATION,
        setEnabled: noop,
        toggle: noop,
      };
    },
```

Add the constant to each file's existing `@rtc/domain` import. This is what makes Task 4's regenerated goldens render the toggle ON.
4. `packages/ui-contract/src/specs/shell/prefs/PreferencesModal.contract.spec.ts:38-45` — the spec seeds `forceBootAnimation: true` and expects the first toggle to write `[false]`. That still passes, but it no longer exercises the non-default direction; flip it to seed `false` and expect `[true]` so the spec proves the seam again:

```ts
  it("force-boot-animation toggle reflects the preference and writes it on toggle", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      forceBootAnimation: false,
    });
    expect(page.forceBootAnimationOn()).toBe(false);
    await page.toggleForceBootAnimation();
    expect(page.forceBootAnimationSets()).toEqual([true]);
  });
```

- [ ] **Step 5: Run the affected suites to verify green**

```bash
pnpm --filter @rtc/domain test
pnpm --filter @rtc/client-react test
pnpm --filter @rtc/client-solid test
pnpm --filter @rtc/client-react-native test -- AsyncStoragePreferencesAdapter
pnpm --filter @rtc/client-react test:ui:contract 2>/dev/null || pnpm --filter @rtc/client-react test:ui
```

(Use whatever contract-tier script name exists in `packages/client-react/package.json` — check `pnpm --filter @rtc/client-react run` for the exact name.)
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(prefs): boot splash plays under reduced-motion by default — DEFAULT_FORCE_BOOT_ANIMATION true"
```

---

### Task 2: React — extract `ModalShell`, leave `PreferencesContent`

**Files:**
- Create: `packages/client-react/src/ui/shell/modal/ModalShell.tsx`
- Create: `packages/client-react/src/ui/shell/modal/ModalShell.module.css`
- Create: `packages/client-react/src/ui/shell/modal/ModalShell.test.tsx`
- Move (git mv): `packages/client-react/src/ui/shell/prefs/useDraggableDialog.ts` → `packages/client-react/src/ui/shell/modal/useDraggableDialog.ts` (and its `.test.ts`)
- Create: `packages/client-react/src/ui/shell/prefs/PreferencesContent.tsx`
- Move (git mv): `packages/client-react/src/ui/shell/prefs/PreferencesModal.module.css` → `packages/client-react/src/ui/shell/prefs/PreferencesContent.module.css` (then strip shell classes)
- Modify: `packages/client-react/src/ui/shell/prefs/PreferencesModal.tsx` (becomes ~40 lines)
- Modify: `packages/client-react/src/ui/shell/prefs/PrefToggle.tsx:3`, `PrefSegment.tsx:3` (styles import path)

**Interfaces:**
- Consumes: nothing from Task 1 (independent).
- Produces (Task 3 mirrors it; Task 4 mounts it):
  - `ModalShell(props: { open: boolean; title: string; subtitle: string; footNote: string; ariaLabel: string; closeAriaLabel: string; rootTestid: string; closeTestid: string; doneTestid: string; onClose: () => void; children: ReactNode }): ReactElement | null`
  - `PreferencesContent(): ReactElement` — no props; reads `useViewModel()` itself.

- [ ] **Step 1: Split the CSS module**

`git mv packages/client-react/src/ui/shell/prefs/PreferencesModal.module.css packages/client-react/src/ui/shell/prefs/PreferencesContent.module.css`

Create `packages/client-react/src/ui/shell/modal/ModalShell.module.css` and **move these classes into it verbatim** (cut from `PreferencesContent.module.css`): `.overlay`, `.dialog`, `.head`, `.head:active`, `.title`, `.subtitle`, `.closeButton`, `.body`, `.foot`, `.footNote`, `.doneButton` — including their comments (the `max-height: 86vh` clamp on `.dialog` and the `overflow: auto` on `.body` now live in the shell).

`PreferencesContent.module.css` keeps: `.grid`, `.column`, `.sectionHead`, `.row`, `.rowText`, `.rowLabel`, `.rowDesc`, `.gateHint`, `.sw` (+ its `::after`/`[data-on]` rules), `.seg`, `.segButton` (+ its states).

- [ ] **Step 2: Move the drag hook and write `ModalShell.tsx`**

```bash
git mv packages/client-react/src/ui/shell/prefs/useDraggableDialog.ts packages/client-react/src/ui/shell/modal/useDraggableDialog.ts
git mv packages/client-react/src/ui/shell/prefs/useDraggableDialog.test.ts packages/client-react/src/ui/shell/modal/useDraggableDialog.test.ts
```

Create `packages/client-react/src/ui/shell/modal/ModalShell.tsx`:

```tsx
import type { ReactElement, ReactNode } from "react";

import { useDraggableDialog } from "./useDraggableDialog";

import styles from "./ModalShell.module.css";

/**
 * Generic draggable HUD dialog chrome: dimmed overlay, drag-by-header dialog
 * (`useDraggableDialog`), title/subtitle header with a ✕ control, a scrollable
 * body clamped to 86vh (the ONLY scroll container — content renders at natural
 * height inside it), and a footer note + DONE button. Purely presentational:
 * every string/testid is a prop, both the ✕ and DONE fire the same `onClose`
 * slot, and the body renders `children` — so a surface owns its content
 * component and this shell owns the dialog ceremony. Extracted verbatim from
 * PreferencesModal (its only consumer today) so content can be visually
 * asserted un-clamped; see docs/superpowers/specs/2026-08-12-prefs-modal-
 * shell-split-and-boot-default-design.md.
 */
export function ModalShell({
  open,
  title,
  subtitle,
  footNote,
  ariaLabel,
  closeAriaLabel,
  rootTestid,
  closeTestid,
  doneTestid,
  onClose,
  children,
}: ModalShellProps): ReactElement | null {
  const { dialogRef, headerProps, dialogStyle } = useDraggableDialog({ open });

  if (!open) {
    return null;
  }

  return (
    <div data-testid={rootTestid} className={styles.overlay}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-label={ariaLabel}
        className={styles.dialog}
        style={dialogStyle}
      >
        <header className={styles.head} {...headerProps}>
          <div>
            <div className={styles.title}>{title}</div>
            <div className={styles.subtitle}>{subtitle}</div>
          </div>
          <button
            type="button"
            data-testid={closeTestid}
            data-nodrag=""
            aria-label={closeAriaLabel}
            className={styles.closeButton}
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className={styles.body}>{children}</div>

        <footer className={styles.foot}>
          <span className={styles.footNote}>{footNote}</span>
          <button
            type="button"
            data-testid={doneTestid}
            className={styles.doneButton}
            onClick={onClose}
          >
            DONE
          </button>
        </footer>
      </div>
    </div>
  );
}

interface ModalShellProps {
  /** The shell renders only when `open` is true (the hook still sees the
   * transition, preserving drag-position reset semantics). */
  open: boolean;
  title: string;
  subtitle: string;
  /** Footer left-side note (e.g. a ⚡ hint line). */
  footNote: string;
  /** aria-label for the dialog element. */
  ariaLabel: string;
  /** aria-label for the ✕ control. */
  closeAriaLabel: string;
  rootTestid: string;
  closeTestid: string;
  doneTestid: string;
  /** Fired by both the ✕ and DONE controls. */
  onClose: () => void;
  children: ReactNode;
}
```

Note the `dialogStyle` on `style=` — this is the existing draggable-position inline style, exempt from the inline-style ban exactly as it is today (it's a dynamic transform, not static styling; the rule already tolerates the current call site — if the AST rule flags the moved line, keep whatever escape the original `PreferencesModal.tsx:159` used).

- [ ] **Step 3: Create `PreferencesContent.tsx` (verbatim content move)**

Create `packages/client-react/src/ui/shell/prefs/PreferencesContent.tsx` from the current `PreferencesModal.tsx` by taking, **unchanged**: all imports except `useDraggableDialog` (drop it) and `ReactNode`-irrelevant ones; the doc comment about the two-column catalogue (reworded header line: "Preferences catalogue content …" and note the shell lives in `ModalShell`); every hook call and helper (`gate`/`gateHint`/`jarvisBrainOptions`/`toggles`/`segments`/`toggleCosmetic`/`selectSegment`); the `ToggleGroup`/`SegmentGroup` components; all `interface`s except `PreferencesModalProps`; every `const` catalogue (`AMBIENT_STYLE_OPTIONS` … `INITIAL_SEGMENTS`). The styles import becomes `import styles from "./PreferencesContent.module.css";`.

Its component body drops the `if (!open)` gate, the overlay/dialog/header/footer markup and `useState` stays; it returns exactly the grid subtree:

```tsx
export function PreferencesContent(): ReactElement {
  // …all existing hooks/state/handlers verbatim…
  return (
    <div className={styles.grid}>
      {/* both existing data-testid="prefs-column" columns, verbatim */}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `PreferencesModal.tsx` as the composition**

```tsx
import type { ReactElement } from "react";

import { ModalShell } from "../modal/ModalShell";

import { PreferencesContent } from "./PreferencesContent";

/**
 * Preferences catalogue modal: the generic ModalShell dialog ceremony wrapping
 * PreferencesContent (the two-column preferences grid). Split so the grid can
 * be mounted un-clamped by the visual tier (`prefs/content`) while this
 * composition stays the app entry point — testids and DOM are unchanged from
 * the pre-split component.
 */
export function PreferencesModal({
  open,
  onClose,
}: PreferencesModalProps): ReactElement | null {
  return (
    <ModalShell
      open={open}
      title="PREFERENCES"
      subtitle="DISPLAY · MOTION · JARVIS · TRADING · NOTIFICATIONS · DATA"
      footNote="⚡ Static background recommended — lowest GPU load"
      ariaLabel="Preferences"
      closeAriaLabel="Close preferences"
      rootTestid="prefs-modal"
      closeTestid="prefs-close"
      doneTestid="prefs-done"
      onClose={onClose}
    >
      <PreferencesContent />
    </ModalShell>
  );
}

interface PreferencesModalProps {
  /** The modal renders only when `open` is true. */
  open: boolean;
  /** Fired when the modal is dismissed (✕ or DONE). */
  onClose: () => void;
}
```

Update `PrefToggle.tsx` / `PrefSegment.tsx` line 3 to `import styles from "./PreferencesContent.module.css";`.

- [ ] **Step 5: Write `ModalShell.test.tsx`**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ModalShell } from "./ModalShell";

function renderShell(open: boolean, onClose = vi.fn()): typeof onClose {
  render(
    <ModalShell
      open={open}
      title="TITLE"
      subtitle="SUB"
      footNote="NOTE"
      ariaLabel="Test dialog"
      closeAriaLabel="Close test dialog"
      rootTestid="shell-root"
      closeTestid="shell-close"
      doneTestid="shell-done"
      onClose={onClose}
    >
      <div data-testid="shell-child">content</div>
    </ModalShell>,
  );
  return onClose;
}

describe("ModalShell", () => {
  it("renders nothing when closed", () => {
    renderShell(false);
    expect(screen.queryByTestId("shell-root")).toBeNull();
  });

  it("renders chrome, children and testids when open", () => {
    renderShell(true);
    expect(screen.getByTestId("shell-root")).toBeTruthy();
    expect(screen.getByText("TITLE")).toBeTruthy();
    expect(screen.getByText("SUB")).toBeTruthy();
    expect(screen.getByText("NOTE")).toBeTruthy();
    expect(screen.getByTestId("shell-child")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Test dialog" })).toBeTruthy();
  });

  it("fires onClose from the ✕ control", () => {
    const onClose = renderShell(true);
    fireEvent.click(screen.getByTestId("shell-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fires onClose from the DONE button", () => {
    const onClose = renderShell(true);
    fireEvent.click(screen.getByTestId("shell-done"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

Match the surrounding tests' import style (check `PreferencesModal.test.tsx` for whether the repo uses `@testing-library/react` directly or a wrapper — mirror it).

- [ ] **Step 6: Run the react package suites**

```bash
pnpm --filter @rtc/client-react test
pnpm --filter @rtc/client-react typecheck
pnpm lint
```

Expected: PASS — in particular the untouched `PreferencesModal.test.tsx` (237 lines) proves the composition renders identically. If newspaper-order flags member ordering in the new files, reorder per the rule (exported component first, helpers after, interfaces, then consts).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(react): extract ModalShell dialog chrome from PreferencesModal — content now un-clampable"
```

---

### Task 3: Solid — mirror the split

**Files:**
- Create: `packages/client-solid/src/ui/shell/modal/ModalShell.tsx`
- Create: `packages/client-solid/src/ui/shell/modal/ModalShell.module.css` (verbatim copy of react's — the two clients' prefs CSS files are already verbatim twins)
- Move (git mv): `packages/client-solid/src/ui/shell/prefs/useDraggableDialog.ts` (+ `.test.ts`) → `packages/client-solid/src/ui/shell/modal/`
- Create: `packages/client-solid/src/ui/shell/prefs/PreferencesContent.tsx`
- Move (git mv): `packages/client-solid/src/ui/shell/prefs/PreferencesModal.module.css` → `PreferencesContent.module.css` (strip the same shell classes)
- Modify: `packages/client-solid/src/ui/shell/prefs/PreferencesModal.tsx`, `PrefToggle.tsx:4`, `PrefSegment.tsx:4`

**Interfaces:**
- Consumes: the React shapes from Task 2 (`ModalShellProps` prop names identical).
- Produces: `ModalShell(props)` / `PreferencesContent()` for Solid — same DOM as React's.

- [ ] **Step 1: Repeat Task 2 Steps 1-4 for Solid, with Solid idioms**

The CSS split is identical. The Solid `ModalShell.tsx` differs from React's only in the framework mechanics — no destructuring (keeps prop reactivity), `class=` not `className=`, `Show` instead of the null-return, accessor-wrapped `open` for the hook, and `dialogStyle()` called:

```tsx
import type { JSX } from "solid-js";
import { Show } from "solid-js";

import { useDraggableDialog } from "./useDraggableDialog";

import styles from "./ModalShell.module.css";

/**
 * (same doc comment as the React twin)
 */
export function ModalShell(props: ModalShellProps): JSX.Element {
  const { dialogRef, headerProps, dialogStyle } = useDraggableDialog({
    open: () => {
      return props.open;
    },
  });

  return (
    <Show when={props.open}>
      <div data-testid={props.rootTestid} class={styles.overlay}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-label={props.ariaLabel}
          class={styles.dialog}
          style={dialogStyle()}
        >
          <header class={styles.head} {...headerProps}>
            <div>
              <div class={styles.title}>{props.title}</div>
              <div class={styles.subtitle}>{props.subtitle}</div>
            </div>
            <button
              type="button"
              data-testid={props.closeTestid}
              data-nodrag=""
              aria-label={props.closeAriaLabel}
              class={styles.closeButton}
              onClick={() => {
                props.onClose();
              }}
            >
              ✕
            </button>
          </header>

          <div class={styles.body}>{props.children}</div>

          <footer class={styles.foot}>
            <span class={styles.footNote}>{props.footNote}</span>
            <button
              type="button"
              data-testid={props.doneTestid}
              class={styles.doneButton}
              onClick={() => {
                props.onClose();
              }}
            >
              DONE
            </button>
          </footer>
        </div>
      </div>
    </Show>
  );
}

interface ModalShellProps {
  open: boolean;
  title: string;
  subtitle: string;
  footNote: string;
  ariaLabel: string;
  closeAriaLabel: string;
  rootTestid: string;
  closeTestid: string;
  doneTestid: string;
  onClose: () => void;
  children: JSX.Element;
}
```

Check the current Solid `useDraggableDialog.ts` signature first — it takes `{ open: Accessor<boolean> }` (see `PreferencesModal.tsx:152-156`); keep that call shape. `PreferencesContent.tsx` takes the Solid modal's hooks/`createSignal` state/`createMemo`s/`ToggleGroup`/`SegmentGroup`/catalogues verbatim and returns the `<div class={styles.grid}>` subtree; `PreferencesModal.tsx` becomes the same thin composition as React's (with `props.open`/`props.onClose` accessed inside JSX, not destructured).

- [ ] **Step 2: Run the solid package suites**

```bash
pnpm --filter @rtc/client-solid test
pnpm --filter @rtc/client-solid typecheck
pnpm lint
```

Expected: PASS (the moved `useDraggableDialog.test.ts` and the contract tier via the shared specs are the witnesses; Solid has no per-component unit test for the modal).

- [ ] **Step 3: Run both contract tiers to prove cross-framework parity**

```bash
pnpm --filter @rtc/client-react test:ui:contract
pnpm --filter @rtc/client-solid test:ui:contract
```

(Confirm exact script names via `pnpm --filter @rtc/client-solid run`.) Expected: PASS — `PreferencesModal.contract.spec.ts` green against both compositions.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(solid): mirror the ModalShell/PreferencesContent split — DOM parity with react"
```

---

### Task 4: `prefs/content` visual scenario + local (darwin) golden regen

**Files:**
- Modify: `packages/ui-contract/src/visual/scenarios.ts:726` (add entry beside `prefs/modal`)
- Modify: `packages/ui-contract/src/visual/scenarioActions.ts:289` (add action beside `prefs/modal`'s)
- Modify: `packages/client-react/tests/ui/visual/react/registry.tsx` (import + entry)
- Modify: `packages/client-solid/tests/ui/visual/solid/registry.tsx` (import + entry)
- Goldens: new `prefs-content.png` × 10 themes + updated `prefs-modal.png` × 10 (toggle ON) in `packages/ui-contract/goldens/.../react-local/darwin-arm64/`

**Interfaces:**
- Consumes: `PreferencesContent` from Tasks 2-3.
- Produces: scenario id `prefs/content` (matrix-expands to `prefs/content__<skin>-<mode>` × 10) for Task 5's x86 regen.

- [ ] **Step 1: Add the scenario + action**

`scenarios.ts`, directly under the `"prefs/modal"` line:

```ts
  // Content-only mount of the preferences grid — the ModalShell (and its 86vh
  // clamp) is deliberately absent, so every row renders at natural height and
  // gets pixel-asserted; prefs/modal keeps documenting the clamped in-shell
  // view. Same fixture as prefs/modal.
  "prefs/content": {
    componentKey: "PreferencesContent",
    fixtureKey: "prefs-open",
  },
```

`scenarioActions.ts`, beside the `"prefs/modal"` entry (this one is NOT fullPage — it's a scenario-root element shot; the wait pins the bottom-most row against the first-mount race):

```ts
  // Element shot (scenario-root). "Narrator" is the last row of column 2, so
  // waiting for it proves the whole grid — incl. the JARVIS section that
  // prefs/modal clips — is rendered before capture.
  "prefs/content": { waitForText: "Narrator" },
```

- [ ] **Step 2: Run the registry-coverage guard to see it fail**

Run: `pnpm --filter @rtc/client-react test -- registryCoverage`
Expected: FAIL — `PreferencesContent` has no registry entry (this test exists exactly for this gap; if the script filter doesn't match, run the file directly: `pnpm --filter @rtc/client-react exec vitest run tests/ui/visual/react/registryCoverage.test.ts`).

- [ ] **Step 3: Add both registry entries**

`packages/client-react/tests/ui/visual/react/registry.tsx` — add beside the `PreferencesModal` entry (plus `import { PreferencesContent } from "#/ui/shell/prefs/PreferencesContent";` in import order):

```tsx
  PreferencesContent: () => {
    // Un-clamped content mount (the point of the scenario). Width is pinned to
    // the dialog's 800px so text wrapping matches the in-shell render (content
    // width from font metrics would flake — see StatusBar above), and the
    // dialog's own background is painted behind the transparent grid.
    return (
      <div
        style={{
          width: "800px",
          padding: "4px 22px 14px",
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        <PreferencesContent />
      </div>
    );
  },
```

Solid twin in `packages/client-solid/tests/ui/visual/solid/registry.tsx` (Solid style-object keys are kebab-case strings, matching its neighbours):

```tsx
  PreferencesContent: () => {
    // (same comment as react's entry)
    return (
      <div
        style={{
          width: "800px",
          padding: "4px 22px 14px",
          "background-color": "var(--bg-secondary)",
        }}
      >
        <PreferencesContent />
      </div>
    );
  },
```

Do NOT add `PreferencesContent` to either client's `FULL_BLEED` set in `VisualScenario.tsx` — the content mount wants the standard scenario-root wrapper.

- [ ] **Step 4: Re-run the coverage guard (both clients)**

```bash
pnpm --filter @rtc/client-react test -- registryCoverage
pnpm --filter @rtc/client-solid test -- registryCoverage
```

Expected: PASS.

- [ ] **Step 5: Regenerate the local darwin goldens (scoped) and eyeball them**

Kill any stale vite dev server first (Playwright reuses a running :3200 server, which would serve pre-split code):

```bash
lsof -ti :3200 | xargs kill 2>/dev/null; pnpm build
pnpm --filter @rtc/client-react exec playwright test \
  -c tests/ui/visual/playwright/playwright.config.ts \
  --grep "prefs/" --update-snapshots=all
```

Then verify with `git status` — expect exactly: 10 modified `prefs-modal.png` + 10 new `prefs-content.png` under `react-local/darwin-arm64/`. **Read one of each with the Read tool:** `prefs-modal` must differ from the old golden ONLY by the boot-animation toggle now ON; `prefs-content` must show all rows through JARVIS Brain/Effort/Narrator with the toggle ON, no scrollbar, no clipping. If `prefs-modal` shows any other diff, the split is not pixel-pure — stop and fix before proceeding.

- [ ] **Step 6: Full visual assert on both clients (no update) — proves the refactor is pixel-pure everywhere else**

```bash
pnpm --filter @rtc/client-react test:ui:visual:react
pnpm --filter @rtc/client-solid test:ui:visual:solid
```

Expected: PASS. A solid failure on any `prefs/*` scenario means the Solid DOM shape diverged from React's — diff the two `PreferencesContent.tsx`/`ModalShell.tsx` structures, not the tolerance.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(visual): prefs/content scenario — un-clamped preferences grid, all rows pixel-asserted (darwin set)"
```

---

### Task 5: x86 golden regen, STATUS close-out, gauntlet, PR → merge

**Files:**
- Goldens: `packages/ui-contract/goldens/.../react/` (x86 set — regenerated by workflow dispatch on this branch)
- Modify: `docs/STATUS.md` (remove the 🔴 entry this branch added — the same PR completes it)

**Interfaces:**
- Consumes: everything prior.
- Produces: the merged PR.

- [ ] **Step 1: Dispatch the x86 golden regen on THIS branch and wait**

```bash
git push -u origin worktree-prefs-shell-split
gh workflow run update-visual-goldens.yml --ref worktree-prefs-shell-split
sleep 60 && gh run list --workflow=update-visual-goldens.yml --limit 1 \
  --json databaseId,status,conclusion,headBranch
```

Poll until `completed`/`success` (the run takes ~10-15 min; it commits the regenerated x86 `react/` set back to the dispatched branch — verify with `git pull` that new `prefs-content.png` files and the 10 toggle-flipped `prefs-modal.png` landed; if the workflow instead uploads an artifact without committing, download it with `gh run download <id>` and commit the PNGs manually). Then **Read one x86 `prefs-content.png`** to confirm content completeness there too.

- [ ] **Step 2: Remove the STATUS.md backlog entry**

Delete the `- **Prefs ModalShell/content split + force-boot-animation default flip** — …` bullet from `## 🔴 Designed, not built` in `docs/STATUS.md` (this PR implements it; STATUS is pending-only), bump the `**Last updated:**` date if a different day, and run `pnpm check:doc-links`.

- [ ] **Step 3: Run the gauntlet**

Run `/rtc:gauntlet full` (≈8 min — typecheck, tests, both ≥95% contract coverage gates, type-aware ESLint, build, lint ledger). Also run `biome ci .` explicitly (CI checks format + import-sort; local `pnpm lint` doesn't). Fix anything red, commit.

- [ ] **Step 4: Open the PR and loop on CI**

```bash
git push
gh pr create --base main --head worktree-prefs-shell-split \
  --title "feat(prefs): ModalShell/content split + boot-animation default ON — all prefs rows pixel-asserted" \
  --body "$(cat <<'EOF'
Two-part change per docs/superpowers/specs/2026-08-12-prefs-modal-shell-split-and-boot-default-design.md:

**A — DEFAULT_FORCE_BOOT_ANIMATION → true.** The toggle only overrides prefers-reduced-motion (the splash already plays for everyone else); showcase default now plays it there too, opt-out preserved, Freeze + webdriver suppression untouched. Port contract, RN adapter test, harness/fake defaults flipped in step.

**B — ModalShell / PreferencesContent split (react + solid).** Reusable dialog chrome (overlay/draggable header/86vh-clamped body/footer) extracted to src/ui/shell/modal/; the preferences grid keeps its ViewModel wiring in PreferencesContent. Pure refactor: testids/DOM unchanged, contract + e2e untouched. New prefs/content visual scenario mounts the grid un-clamped, so the previously-clipped Login-wait-delay + JARVIS rows are now pixel-asserted across all 10 theme combos (both golden sets regenerated; prefs/modal diffs only by the toggle state).

Spec + STATUS bookkeeping included (entry removed on completion).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01DLtJhLQWZMDAL4zRPpCq44
EOF
)"
```

Poll CI matching your `headSha` (zsh: use `st`, not `status`):

```bash
HEAD_SHA=$(git rev-parse HEAD)
gh run list --branch worktree-prefs-shell-split --workflow CI \
  --json status,conclusion,headSha --limit 5
```

Loop per the shipping-repo-changes rules (mergeability check if no run appears; ~25 min diagnose budget). Also check CodeQL/code-scanning comments before merging (it posts after the rollup).

- [ ] **Step 5: Triage catch-up, merge, verify, clean up**

```bash
git fetch origin main
git diff --name-only HEAD...origin/main   # triage per Rule 3 (prose-only → merge as-is)
gh pr merge <n> --merge --subject "Merge PR #<n>: feat(prefs): ModalShell/content split + boot-animation default ON"
gh pr view <n> --json state -q .state     # MERGED
git merge-base --is-ancestor $(git rev-parse HEAD) origin/main && echo landed
```

Then remove the worktree + branch (`ExitWorktree action:remove`, or `git worktree remove .claude/worktrees/prefs-shell-split && git branch -D worktree-prefs-shell-split` from the primary checkout). Post-merge, `visual.yml` runs on main as the backstop.
