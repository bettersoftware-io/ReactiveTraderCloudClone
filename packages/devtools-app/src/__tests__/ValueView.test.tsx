import { afterEach, expect, test } from "vitest";

import type { SerializedValue } from "@rtc/devtools-core";

import { valueViewPage } from "#tests/pages/ValueViewPage";

const view = valueViewPage();

afterEach(() => {
  view.unmountAll();
});

test("renders a nested plain object as an expandable tree", () => {
  const value: SerializedValue = { a: { b: 1, c: 2 } };
  view.mountValueView(value);

  expect(view.hasText("Object(1)")).toBe(true);
  expect(view.hasText("Object(2)")).toBe(true);
  expect(view.hasText("a:")).toBe(true);
  expect(view.hasText("b:")).toBe(true);
  expect(view.hasText("c:")).toBe(true);
  expect(view.hasText("1")).toBe(true);
  expect(view.hasText("2")).toBe(true);
});

test("renders a map tag as an expandable Map(n) node with key -> value pairs", () => {
  const value: SerializedValue = {
    $t: "map",
    entries: [["k", 1]],
  };
  view.mountValueView(value);

  expect(view.hasText("Map(1)")).toBe(true);
  expect(view.hasText('"k"')).toBe(true);
});

test("renders a truncation marker", () => {
  const value: SerializedValue = { $t: "truncated", count: 10 };
  view.mountValueView(value);

  expect(view.hasText("…+10")).toBe(true);
});

test("degrades gracefully on an unknown tag instead of crashing", () => {
  const value: SerializedValue = { $t: "mystery-future-tag", extra: 1 };
  view.mountValueView(value);

  expect(view.hasText('{"$t":"mystery-future-tag","extra":1}')).toBe(true);
});

test("shows the true pre-truncation size for an overflowed array, not the marker-inflated count", () => {
  const entries: SerializedValue[] = Array.from({ length: 50 }, (_, i) => {
    return i;
  });
  const value: SerializedValue = [...entries, { $t: "truncated", count: 10 }];
  view.mountValueView(value);

  expect(view.hasText("Array(60)")).toBe(true);
  expect(view.hasText("Array(51)")).toBe(false);
  expect(view.hasText("…+10")).toBe(true);
});

test("shows the true pre-truncation size for an overflowed map, not the marker-inflated count", () => {
  const pairs: SerializedValue[] = Array.from({ length: 50 }, (_, i) => {
    return [`k${i}`, i];
  });

  const value: SerializedValue = {
    $t: "map",
    entries: [...pairs, { $t: "truncated", count: 10 }],
  };
  view.mountValueView(value);

  expect(view.hasText("Map(60)")).toBe(true);
  expect(view.hasText("Map(51)")).toBe(false);
  expect(view.hasText("…+10")).toBe(true);
});

test("shows the true pre-truncation size for an overflowed set, not the marker-inflated count", () => {
  const values: SerializedValue[] = Array.from({ length: 50 }, (_, i) => {
    return i;
  });

  const value: SerializedValue = {
    $t: "set",
    values: [...values, { $t: "truncated", count: 10 }],
  };
  view.mountValueView(value);

  expect(view.hasText("Set(60)")).toBe(true);
  expect(view.hasText("Set(51)")).toBe(false);
  expect(view.hasText("…+10")).toBe(true);
});

test("renders the undefined tag as the undefined keyword", () => {
  const value: SerializedValue = { $t: "undefined" };
  view.mountValueView(value);

  expect(view.hasText("undefined")).toBe(true);
});

test("renders a non-finite num tag as its raw literal with no suffix", () => {
  const value: SerializedValue = { $t: "num", v: "NaN" };
  view.mountValueView(value);

  expect(view.hasText("NaN")).toBe(true);
});

test("renders a bigint tag with the trailing n suffix", () => {
  const value: SerializedValue = { $t: "bigint", v: "9007199254740993" };
  view.mountValueView(value);

  expect(view.hasText("9007199254740993n")).toBe(true);
});

test("renders a symbol tag with no suffix", () => {
  const value: SerializedValue = { $t: "symbol", v: "Symbol(id)" };
  view.mountValueView(value);

  expect(view.hasText("Symbol(id)")).toBe(true);
});

test("renders a named fn tag as its function name", () => {
  const value: SerializedValue = { $t: "fn", name: "handleTrade" };
  view.mountValueView(value);

  expect(view.hasText("ƒ handleTrade")).toBe(true);
});

test("renders an fn tag with no name as anonymous", () => {
  const value: SerializedValue = { $t: "fn" };
  view.mountValueView(value);

  expect(view.hasText("ƒ (anonymous)")).toBe(true);
});

test("renders the circular tag as a titled marker glyph", () => {
  const value: SerializedValue = { $t: "circular" };
  view.mountValueView(value);

  expect(view.titledMarkerText("circular reference")).toBe("↺");
});

test("renders the depth tag as a titled marker glyph", () => {
  const value: SerializedValue = { $t: "depth" };
  view.mountValueView(value);

  expect(view.titledMarkerText("max depth reached")).toBe("…");
});

test("renders the error tag with its message", () => {
  const value: SerializedValue = { $t: "error", message: "boom" };
  view.mountValueView(value);

  expect(view.hasText("⚠ boom")).toBe(true);
});

test("renders a truncated-string tag as the head plus a char count", () => {
  const value: SerializedValue = {
    $t: "truncated-string",
    head: "hello",
    count: 495,
  };
  view.mountValueView(value);

  expect(view.hasText('"hello"…+495 chars')).toBe(true);
});

test("renders the object key-truncation marker when $truncatedKeys is present", () => {
  const value: SerializedValue = {
    a: 1,
    $truncatedKeys: { $t: "truncated", count: 7 },
  };
  view.mountValueView(value);

  expect(view.hasText("…+7 keys")).toBe(true);
});

test("falls back to zero for a truncation marker missing its count field", () => {
  const value: SerializedValue = { $t: "truncated" };
  view.mountValueView(value);

  expect(view.hasText("…+0")).toBe(true);
});

test("falls back to an empty entry list for a map tag missing its entries field", () => {
  const value: SerializedValue = { $t: "map" };
  view.mountValueView(value);

  expect(view.hasText("Map(0)")).toBe(true);
});
