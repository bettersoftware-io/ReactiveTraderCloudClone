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

test("renders the undefined tag as the undefined keyword", () => {
  const value: SerializedValue = { $t: "undefined" };
  render(<ValueView value={value} />);

  expect(screen.getByText("undefined")).toBeTruthy();
});

test("renders a non-finite num tag as its raw literal with no suffix", () => {
  const value: SerializedValue = { $t: "num", v: "NaN" };
  render(<ValueView value={value} />);

  expect(screen.getByText("NaN")).toBeTruthy();
});

test("renders a bigint tag with the trailing n suffix", () => {
  const value: SerializedValue = { $t: "bigint", v: "9007199254740993" };
  render(<ValueView value={value} />);

  expect(screen.getByText("9007199254740993n")).toBeTruthy();
});

test("renders a symbol tag with no suffix", () => {
  const value: SerializedValue = { $t: "symbol", v: "Symbol(id)" };
  render(<ValueView value={value} />);

  expect(screen.getByText("Symbol(id)")).toBeTruthy();
});

test("renders a named fn tag as its function name", () => {
  const value: SerializedValue = { $t: "fn", name: "handleTrade" };
  render(<ValueView value={value} />);

  expect(screen.getByText("ƒ handleTrade")).toBeTruthy();
});

test("renders an fn tag with no name as anonymous", () => {
  const value: SerializedValue = { $t: "fn" };
  render(<ValueView value={value} />);

  expect(screen.getByText("ƒ (anonymous)")).toBeTruthy();
});

test("renders the circular tag as a titled marker glyph", () => {
  const value: SerializedValue = { $t: "circular" };
  render(<ValueView value={value} />);

  const marker = screen.getByTitle("circular reference");
  expect(marker.textContent?.trim()).toBe("↺");
});

test("renders the depth tag as a titled marker glyph", () => {
  const value: SerializedValue = { $t: "depth" };
  render(<ValueView value={value} />);

  const marker = screen.getByTitle("max depth reached");
  expect(marker.textContent?.trim()).toBe("…");
});

test("renders the error tag with its message", () => {
  const value: SerializedValue = { $t: "error", message: "boom" };
  render(<ValueView value={value} />);

  expect(screen.getByText("⚠ boom")).toBeTruthy();
});

test("renders a truncated-string tag as the head plus a char count", () => {
  const value: SerializedValue = {
    $t: "truncated-string",
    head: "hello",
    count: 495,
  };
  render(<ValueView value={value} />);

  expect(screen.getByText('"hello"…+495 chars')).toBeTruthy();
});

test("renders the object key-truncation marker when $truncatedKeys is present", () => {
  const value: SerializedValue = {
    a: 1,
    $truncatedKeys: { $t: "truncated", count: 7 },
  };
  render(<ValueView value={value} />);

  expect(screen.getByText("…+7 keys")).toBeTruthy();
});

test("falls back to zero for a truncation marker missing its count field", () => {
  const value: SerializedValue = { $t: "truncated" };
  render(<ValueView value={value} />);

  expect(screen.getByText("…+0")).toBeTruthy();
});

test("falls back to an empty entry list for a map tag missing its entries field", () => {
  const value: SerializedValue = { $t: "map" };
  render(<ValueView value={value} />);

  expect(screen.getByText("Map(0)")).toBeTruthy();
});
