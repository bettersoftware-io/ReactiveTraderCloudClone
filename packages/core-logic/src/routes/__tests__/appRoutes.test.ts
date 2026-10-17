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
    ["#/fx", workspaceRoute("fx")],
    ["#/credit", workspaceRoute("credit")],
    ["#/equities", workspaceRoute("equities")],
    ["#/admin", workspaceRoute("admin")],
    ["#/sign-in", accountRoute("signIn")],
    ["#/create-account", accountRoute("register")],
    ["#/forgot-password", accountRoute("requestReset")],
    ["#/enter-code", accountRoute("enterCode")],
  ])("reads %s and writes it back", (hash, route) => {
    expect(parseAppRoute(hash)).toEqual(route);
    expect(formatAppRoute(route)).toBe(hash);
  });

  it.each(["", "#", "#/", "#fx", "#/FX", "#/fx/", "#/fx?x=1", "#/nope", "/fx"])(
    "reads %j as no route",
    (hash) => {
      expect(parseAppRoute(hash)).toBeNull();
    },
  );

  it("compares routes by value", () => {
    const routes: readonly (AppRoute | null)[] = [
      null,
      workspaceRoute("fx"),
      workspaceRoute("credit"),
      accountRoute("signIn"),
      accountRoute("register"),
    ];

    for (const a of routes) {
      for (const b of routes) {
        expect(isSameRoute(a, b)).toBe(a === b);
      }
    }

    expect(isSameRoute(workspaceRoute("fx"), workspaceRoute("fx"))).toBe(true);
  });
});
