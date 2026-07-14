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

test("shows the true pre-truncation size for an overflowed array, not the marker-inflated count", () => {
  const entries: SerializedValue[] = Array.from({ length: 50 }, (_, i) => {
    return i;
  });
  const value: SerializedValue = [...entries, { $t: "truncated", count: 10 }];
  render(<ValueView value={value} />);

  expect(screen.getByText("Array(60)")).toBeTruthy();
  expect(screen.queryByText("Array(51)")).toBeNull();
  expect(screen.getByText("…+10")).toBeTruthy();
});

test("shows the true pre-truncation size for an overflowed map, not the marker-inflated count", () => {
  const pairs: SerializedValue[] = Array.from({ length: 50 }, (_, i) => {
    return [`k${i}`, i];
  });
  const value: SerializedValue = {
    $t: "map",
    entries: [...pairs, { $t: "truncated", count: 10 }],
  };
  render(<ValueView value={value} />);

  expect(screen.getByText("Map(60)")).toBeTruthy();
  expect(screen.queryByText("Map(51)")).toBeNull();
  expect(screen.getByText("…+10")).toBeTruthy();
});

test("shows the true pre-truncation size for an overflowed set, not the marker-inflated count", () => {
  const values: SerializedValue[] = Array.from({ length: 50 }, (_, i) => {
    return i;
  });
  const value: SerializedValue = {
    $t: "set",
    values: [...values, { $t: "truncated", count: 10 }],
  };
  render(<ValueView value={value} />);

  expect(screen.getByText("Set(60)")).toBeTruthy();
  expect(screen.queryByText("Set(51)")).toBeNull();
  expect(screen.getByText("…+10")).toBeTruthy();
});
