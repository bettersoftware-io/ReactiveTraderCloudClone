import { expect, test } from "vitest";

import { ALL_SCOPE } from "#/nav/scope";
import { useNavigationPage } from "#tests/pages/UseNavigationPage";

test("starts at All; select replaces the scope and forgets any previous one", () => {
  const nav = useNavigationPage();

  expect(nav.scope).toEqual(ALL_SCOPE);
  expect(nav.previousScope).toBeNull();

  nav.select({ kind: "wire" });
  expect(nav.scope).toEqual({ kind: "wire" });
  expect(nav.previousScope).toBeNull();
});

test("pushScope remembers one level; popScope restores it once", () => {
  const nav = useNavigationPage();

  nav.select({ kind: "presenter", presenter: "blotter" });
  nav.pushScope(ALL_SCOPE);
  expect(nav.scope).toEqual(ALL_SCOPE);
  expect(nav.previousScope).toEqual({
    kind: "presenter",
    presenter: "blotter",
  });

  expect(nav.popScope()).toBe(true);
  expect(nav.scope).toEqual({
    kind: "presenter",
    presenter: "blotter",
  });
  expect(nav.previousScope).toBeNull();

  expect(nav.popScope()).toBe(false);
});

test("pushScope onto the same scope records no history", () => {
  const nav = useNavigationPage();

  nav.pushScope(ALL_SCOPE);
  expect(nav.previousScope).toBeNull();
});
