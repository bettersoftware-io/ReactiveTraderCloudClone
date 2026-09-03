import { afterEach, expect, test } from "vitest";

import type { DiffEntry } from "@rtc/devtools-core";

import { diffViewPage } from "#tests/pages/DiffViewPage";

const view = diffViewPage();

afterEach(() => {
  view.unmountAll();
});

test("renders one row per entry with path, kind, and both values", () => {
  const entries: DiffEntry[] = [
    { path: ["fx", "bid"], kind: "changed", before: 1.08, after: 1.07 },
    { path: ["fresh"], kind: "added", before: null, after: 3 },
  ];

  view.mountDiffView({ entries, noPrior: false });

  expect(view.hasText("fx.bid")).toBe(true);
  expect(view.hasText("changed")).toBe(true);
  expect(view.hasText("1.08")).toBe(true);
  expect(view.hasText("1.07")).toBe(true);
  expect(view.hasText("added")).toBe(true);
});

test("a removed leaf shows its before value, no arrow, and no after value", () => {
  const entries: DiffEntry[] = [
    { path: ["gone"], kind: "removed", before: 9, after: null },
  ];

  view.mountDiffView({ entries, noPrior: false });

  expect(view.hasText("removed")).toBe(true);
  expect(view.hasText("9")).toBe(true);
  expect(view.hasText("→")).toBe(false);
});

test("renders the empty and no-prior states", () => {
  view.mountDiffView({ entries: [], noPrior: false });
  expect(view.hasText("No changes vs previous value.")).toBe(true);

  view.rerenderWith({ entries: [], noPrior: true });
  expect(view.hasText("No prior value to diff against.")).toBe(true);
});

test("handles path keys with injective collision avoidance", () => {
  const entries: DiffEntry[] = [
    { path: ["a.b"], kind: "changed", before: 1, after: 2 },
    { path: ["a", "b"], kind: "changed", before: 3, after: 4 },
  ];

  view.mountDiffView({ entries, noPrior: false });

  expect(view.textCount("a.b")).toBe(2);
});
