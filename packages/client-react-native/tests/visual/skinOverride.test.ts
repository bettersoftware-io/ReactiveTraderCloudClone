import { expect, test } from "vitest";

import { parseSkinFlag, parseSkinOverride } from "./skinOverride";

test("two known values make an override", () => {
  expect(parseSkinOverride("neon", "light")).toEqual({
    skin: "neon",
    mode: "light",
  });
});

test("no parameters is no override — what every golden run sees", () => {
  expect(parseSkinOverride(undefined, undefined)).toBeNull();
});

// A lone half would mix the override with the scenario's pin.
test("a lone skin or a lone mode is no override", () => {
  expect(parseSkinOverride("neon", undefined)).toBeNull();
  expect(parseSkinOverride(undefined, "light")).toBeNull();
});

test("an unknown skin or mode is no override", () => {
  expect(parseSkinOverride("neno", "light")).toBeNull();
  expect(parseSkinOverride("neon", "dim")).toBeNull();
});

test("the flag spelling is skin:mode, and nothing looser", () => {
  expect(parseSkinFlag("terminal3d:dark")).toEqual({
    skin: "terminal3d",
    mode: "dark",
  });
  expect(parseSkinFlag("terminal3d")).toBeNull();
  expect(parseSkinFlag("terminal3d:dark:extra")).toBeNull();
  expect(parseSkinFlag("")).toBeNull();
});
