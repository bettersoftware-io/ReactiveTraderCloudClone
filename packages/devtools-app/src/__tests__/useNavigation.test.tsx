import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";

import { ALL_SCOPE } from "#/nav/scope";
import { useNavigation } from "#/nav/useNavigation";

test("starts at All; select replaces the scope and forgets any previous one", () => {
  const { result } = renderHook(useNavigation);

  expect(result.current.scope).toEqual(ALL_SCOPE);
  expect(result.current.previousScope).toBeNull();

  act(() => {
    result.current.select({ kind: "wire" });
  });
  expect(result.current.scope).toEqual({ kind: "wire" });
  expect(result.current.previousScope).toBeNull();
});

test("pushScope remembers one level; popScope restores it once", () => {
  const { result } = renderHook(useNavigation);

  act(() => {
    result.current.select({ kind: "presenter", presenter: "blotter" });
  });
  act(() => {
    result.current.pushScope(ALL_SCOPE);
  });
  expect(result.current.scope).toEqual(ALL_SCOPE);
  expect(result.current.previousScope).toEqual({
    kind: "presenter",
    presenter: "blotter",
  });

  let popped = false;

  act(() => {
    popped = result.current.popScope();
  });
  expect(popped).toBe(true);
  expect(result.current.scope).toEqual({
    kind: "presenter",
    presenter: "blotter",
  });
  expect(result.current.previousScope).toBeNull();

  act(() => {
    popped = result.current.popScope();
  });
  expect(popped).toBe(false);
});

test("pushScope onto the same scope records no history", () => {
  const { result } = renderHook(useNavigation);

  act(() => {
    result.current.pushScope(ALL_SCOPE);
  });
  expect(result.current.previousScope).toBeNull();
});
