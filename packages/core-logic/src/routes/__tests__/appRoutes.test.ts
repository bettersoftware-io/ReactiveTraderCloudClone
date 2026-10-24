import { describe, expect, it } from "vitest";

import type { AppRoute } from "@rtc/core-api";

import {
  accountRoute,
  formatAppRoute,
  isSameRoute,
  parseAppRoute,
  workspaceRoute,
} from "#/routes/appRoutes";

describe("app routes", () => {
  it.each([
    ["/fx", workspaceRoute("fx")],
    ["/credit", workspaceRoute("credit")],
    ["/equities", workspaceRoute("equities")],
    ["/ops", workspaceRoute("ops")],
    ["/sign-in", accountRoute("signIn")],
    ["/create-account", accountRoute("register")],
    ["/forgot-password", accountRoute("requestReset")],
    ["/enter-code", accountRoute("enterCode")],
  ])("reads %s and writes it back", (path, route) => {
    expect(parseAppRoute(path)).toEqual(route);
    expect(formatAppRoute(route)).toBe(path);
  });

  it.each([
    "",
    "/",
    "fx",
    "/FX",
    "/fx/",
    "//fx",
    "/fx?x=1",
    "/nope",
    "/admin",
    "#/fx",
    "/devtools",
    "/devtools/",
    "/popout.html",
    "/constructor",
    "/__proto__",
  ])("reads %j as no route", (path) => {
    expect(parseAppRoute(path)).toBeNull();
  });

  it("compares routes by value: equal only for the same tab or mode", () => {
    const left = createEveryRoute();
    const right = createEveryRoute();

    left.forEach((a, i) => {
      right.forEach((b, j) => {
        expect(a).not.toBe(b);
        expect(
          isSameRoute(a, b),
          `${formatAppRoute(a)} vs ${formatAppRoute(b)}`,
        ).toBe(i === j);
      });
    });
  });

  it("treats null as equal to null only", () => {
    expect(isSameRoute(null, null)).toBe(true);

    for (const route of createEveryRoute()) {
      expect(isSameRoute(null, route)).toBe(false);
      expect(isSameRoute(route, null)).toBe(false);
    }
  });
});

/** Fresh objects on every call, so a comparison by identity would fail
 * the equal pairs in "compares routes by value". */
function createEveryRoute(): readonly AppRoute[] {
  return [
    workspaceRoute("fx"),
    workspaceRoute("credit"),
    workspaceRoute("equities"),
    workspaceRoute("ops"),
    accountRoute("signIn"),
    accountRoute("register"),
    accountRoute("requestReset"),
    accountRoute("enterCode"),
  ];
}
