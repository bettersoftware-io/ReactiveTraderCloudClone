import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import type { SerializedValue } from "@rtc/devtools-core";

import { ValueView } from "#/panels/ValueView";

afterEach(cleanup);

test("renders a nested plain object as an expandable tree", () => {
  const value: SerializedValue = { a: { b: 1, c: 2 } };
  render(<ValueView value={value} />);

  expect(screen.getByText("Object(1)")).toBeTruthy();
  expect(screen.getByText("Object(2)")).toBeTruthy();
  expect(screen.getByText("a:")).toBeTruthy();
  expect(screen.getByText("b:")).toBeTruthy();
  expect(screen.getByText("c:")).toBeTruthy();
  expect(screen.getByText("1")).toBeTruthy();
  expect(screen.getByText("2")).toBeTruthy();
});

test("renders a map tag as an expandable Map(n) node with key -> value pairs", () => {
  const value: SerializedValue = {
    $t: "map",
    entries: [["k", 1]],
  };
  render(<ValueView value={value} />);

  expect(screen.getByText("Map(1)")).toBeTruthy();
  expect(screen.getByText('"k"')).toBeTruthy();
});

test("renders a truncation marker", () => {
  const value: SerializedValue = { $t: "truncated", count: 10 };
  render(<ValueView value={value} />);

  expect(screen.getByText("…+10")).toBeTruthy();
});

test("degrades gracefully on an unknown tag instead of crashing", () => {
  const value: SerializedValue = { $t: "mystery-future-tag", extra: 1 };
  render(<ValueView value={value} />);

  expect(
    screen.getByText('{"$t":"mystery-future-tag","extra":1}'),
  ).toBeTruthy();
});
