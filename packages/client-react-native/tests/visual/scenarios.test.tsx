import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { expect, test } from "@jest/globals";
import { isValidElement, type ReactNode } from "react";

import { AppearanceOverlay } from "#/ui/shell/appearance/AppearanceOverlay";

import { TradeTicketFixture } from "./fixtures";
import { SCENARIO_IDS } from "./scenarioIds";
import { getScenario, SCENARIOS } from "./scenarios";

test("has unique ids and covers the chosen prove-the-harness surfaces", () => {
  const ids = SCENARIOS.map((s) => {
    return s.id;
  });
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toContain("blotter/seeded");
  expect(ids).toContain("shell/connection-banner");
  expect(ids).toContain("shell/appearance");
});

test("registry ids stay in sync with the pure SCENARIO_IDS runner list", () => {
  // The Node/tsx runners iterate SCENARIO_IDS (no RN import); the registry
  // builds RN scenarios. They must not drift, or a runner would silently skip
  // (or fail to find) a scenario.
  expect(
    SCENARIOS.map((s) => {
      return s.id;
    }).sort(),
  ).toEqual([...SCENARIO_IDS].sort());
});

test("resolves by id", () => {
  expect(getScenario("blotter/seeded")?.skin).toBeDefined();
  expect(getScenario("nope")).toBeUndefined();
});

// `AppearanceOverlay` mounts a `BottomSheetModal`, which throws
// `'BottomSheetModalInternalContext' cannot be null!'` with no
// `BottomSheetModalProvider` ancestor. `app/(app)/_layout.tsx` supplies one
// for the real app, but `app/__visual/[...id].tsx` (this scenario's host
// route) is a SIBLING of that layout, not inside it, and `VisualScenarioHost`
// itself supplies only `ViewModelProvider` + `ThemeProvider` — so without a
// provider somewhere in THIS scenario's own tree, the harness would crash the
// moment this scenario is captured or the golden re-pinned (docs/rn-open-items.md
// T44). This walks the ELEMENT TREE `build()` returns — no rendering, no
// hooks run — so it is unaffected by the package-wide `__mocks__/@gorhom/
// bottom-sheet.tsx` double that would otherwise hide the missing provider
// from every other jest-tier check (that double's `BottomSheetModal` never
// calls the real `useBottomSheetModalInternal()`, so it can't throw). Kept
// deliberately scoped to just this scenario, not every scenario, because
// only `shell/appearance` mounts a `BottomSheetModal` at all.
test("shell/appearance nests AppearanceOverlay inside its own BottomSheetModalProvider", () => {
  const tree = getScenario("shell/appearance")?.build();
  expect(tree).toBeDefined();

  const ancestors = collectAncestorTypes(tree, AppearanceOverlay);
  expect(ancestors).toBeDefined();
  expect(ancestors).toContain(BottomSheetModalProvider);
});

// `TradeTicketSheet` mounts a `BottomSheetModal` too, so `rates/ticket` is in
// the same crash class as `shell/appearance` above — and the package-wide
// `__mocks__/@gorhom/bottom-sheet.tsx` double hides it from every other
// jest-tier check just the same. Asserted on the un-rendered element tree.
test("rates/ticket nests TradeTicketFixture inside its own BottomSheetModalProvider", () => {
  const tree = getScenario("rates/ticket")?.build();
  expect(tree).toBeDefined();

  const ancestors = collectAncestorTypes(tree, TradeTicketFixture);
  expect(ancestors).toBeDefined();
  expect(ancestors).toContain(BottomSheetModalProvider);
});

interface ElementPropsWithChildren {
  children?: ReactNode;
}

/** Walks a React element tree (as constructed by JSX, never rendered) looking
 * for the first element of type `target`, returning the chain of ancestor
 * `.type`s it found along the way — or `undefined` if `target` never
 * appears. Static: only reads `.type`/`.props.children`, so it works on an
 * un-rendered tree without invoking a single component function or hook. */
function collectAncestorTypes(
  node: ReactNode,
  target: unknown,
  ancestors: unknown[] = [],
): unknown[] | undefined {
  if (!isValidElement(node)) {
    return undefined;
  }

  if (node.type === target) {
    return ancestors;
  }

  const children = (node.props as ElementPropsWithChildren).children;
  const nextAncestors = [...ancestors, node.type];

  for (const child of Array.isArray(children) ? children : [children]) {
    const found = collectAncestorTypes(child, target, nextAncestors);

    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}
