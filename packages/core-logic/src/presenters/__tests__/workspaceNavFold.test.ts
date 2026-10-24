import { describe, expect, it } from "vitest";

import type { WorkspaceNavState } from "@rtc/core-api";

import {
  EVERY_USER_TABS,
  INITIAL_WORKSPACE_NAV,
  stepWorkspaceNav,
  visibleTabsFor,
} from "#/presenters/workspaceNavFold";

describe("workspaceNavFold", () => {
  it("visibleTabsFor: nobody and a user see every tab but admin; an administrator also sees admin, last", () => {
    expect(visibleTabsFor(null)).toEqual(["fx", "credit", "equities", "ops"]);
    expect(visibleTabsFor("user")).toEqual(EVERY_USER_TABS);
    expect(visibleTabsFor("admin")).toEqual([
      "fx",
      "credit",
      "equities",
      "ops",
      "admin",
    ]);
  });

  it("opens on fx with no admin tab", () => {
    expect(INITIAL_WORKSPACE_NAV).toEqual({
      activeTab: "fx",
      visibleTabs: ["fx", "credit", "equities", "ops"],
    });
  });

  it("a switch to admin while the user is not an administrator is refused: the same state", () => {
    const afterUser = stepWorkspaceNav(INITIAL_WORKSPACE_NAV, {
      type: "access",
      access: "user",
    });

    expect(
      stepWorkspaceNav(afterUser, { type: "switchTab", tab: "admin" }),
    ).toBe(afterUser);
  });

  it("an admin access event, then a switch to admin, is accepted", () => {
    const admin = stepWorkspaceNav(INITIAL_WORKSPACE_NAV, {
      type: "access",
      access: "admin",
    });

    expect(admin.visibleTabs).toContain("admin");
    expect(admin.activeTab).toBe("fx");
    expect(
      stepWorkspaceNav(admin, { type: "switchTab", tab: "admin" }).activeTab,
    ).toBe("admin");
  });

  it("losing access while on admin lands on fx", () => {
    const onAdmin: WorkspaceNavState = {
      activeTab: "admin",
      visibleTabs: visibleTabsFor("admin"),
    };

    expect(stepWorkspaceNav(onAdmin, { type: "access", access: null })).toEqual(
      { activeTab: "fx", visibleTabs: visibleTabsFor(null) },
    );
  });

  it("losing access while on credit stays on credit", () => {
    const onCredit: WorkspaceNavState = {
      activeTab: "credit",
      visibleTabs: visibleTabsFor("admin"),
    };

    expect(
      stepWorkspaceNav(onCredit, { type: "access", access: null }).activeTab,
    ).toBe("credit");
  });

  it("a step that changes nothing returns the very same state", () => {
    const admin = stepWorkspaceNav(INITIAL_WORKSPACE_NAV, {
      type: "access",
      access: "admin",
    });

    expect(stepWorkspaceNav(admin, { type: "access", access: "admin" })).toBe(
      admin,
    );
    expect(stepWorkspaceNav(admin, { type: "switchTab", tab: "fx" })).toBe(
      admin,
    );
  });
});
