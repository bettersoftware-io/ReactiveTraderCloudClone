import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import type { DiffEntry } from "@rtc/devtools-core";

import { DiffView } from "#/timeline/DiffView";

afterEach(cleanup);

test("renders one row per entry with path, kind, and both values", () => {
  const entries: DiffEntry[] = [
    { path: ["fx", "bid"], kind: "changed", before: 1.08, after: 1.07 },
    { path: ["fresh"], kind: "added", before: null, after: 3 },
  ];

  render(<DiffView entries={entries} noPrior={false} />);

  expect(screen.getByText("fx.bid")).toBeTruthy();
  expect(screen.getByText("changed")).toBeTruthy();
  expect(screen.getByText("1.08")).toBeTruthy();
  expect(screen.getByText("1.07")).toBeTruthy();
  expect(screen.getByText("added")).toBeTruthy();
});

test("renders the empty and no-prior states", () => {
  const { rerender } = render(<DiffView entries={[]} noPrior={false} />);
  expect(screen.getByText("No changes vs previous value.")).toBeTruthy();

  rerender(<DiffView entries={[]} noPrior={true} />);
  expect(screen.getByText("No prior value to diff against.")).toBeTruthy();
});

test("handles path keys with injective collision avoidance", () => {
  const entries: DiffEntry[] = [
    { path: ["a.b"], kind: "changed", before: 1, after: 2 },
    { path: ["a", "b"], kind: "changed", before: 3, after: 4 },
  ];

  render(<DiffView entries={entries} noPrior={false} />);

  const labels = screen.getAllByText("a.b");
  expect(labels).toHaveLength(2);
});
