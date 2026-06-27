import { HeaderChrome } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { WorkspaceTab } from "#tests/ui/contract/shared/pages/shell/chrome/HeaderChromePage";

beforeEach(() => {
  delete document.documentElement.dataset.mode;
  delete document.documentElement.dataset.skin;
});

afterEach(() => {
  return cleanupMounted();
});

describe("HeaderChrome", () => {
  it("renders the header landmark, wordmark and the three real workspace tabs", () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    expect(header.isRendered()).toBe(true);
    expect(header.wordmark()).toMatch(/reactive trader/i);
    expect(header.tabLabels()).toEqual(["FX", "Credit", "Admin"]);
  });

  it("renders a decorative, non-wired Equities nav item", () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    expect(header.equitiesLabel()).toBe("Equities");
    expect(header.equitiesDisabled()).toBe(true);
  });

  it("highlights the active tab", () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "credit", onTabChange: () => {} },
    });
    expect(header.isActive("credit")).toBe(true);
    expect(header.isActive("fx")).toBe(false);
    expect(header.isActive("admin")).toBe(false);
  });

  it("reports the clicked tab through onTabChange", async () => {
    const changes: WorkspaceTab[] = [];
    const header = mount(HeaderChrome, {
      props: {
        activeTab: "fx",
        onTabChange: (tab: WorkspaceTab) => {
          return changes.push(tab);
        },
      },
    });
    await header.clickTab("credit");
    await header.clickTab("admin");
    expect(changes).toEqual(["credit", "admin"]);
  });

  it("moves the highlight when the active tab prop changes", () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    expect(header.isActive("fx")).toBe(true);
    header.setProps({ activeTab: "admin" });
    expect(header.isActive("admin")).toBe(true);
    expect(header.isActive("fx")).toBe(false);
  });

  it("shows the fixed PROD env badge and the theme picker (skin + mode)", () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    expect(header.envBadge()).toBe("PROD");
    expect(header.hasThemePicker()).toBe(true);
    expect(header.hasThemeToggle()).toBe(true);
  });

  it("opens the decorative notifications dropdown with its seed rows", async () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    expect(header.hasNotifications()).toBe(true);
    const rows = await header.openNotifications();
    expect(rows.length).toBe(3);
    expect(rows.join(" ")).toMatch(/EURUSD position at 80% of desk limit/);
  });

  it("wires the account menu to the session seam and offers the decorative language selector", async () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    expect(header.accountInitials()).toMatch(/AS/);
    const name = await header.openAccount();
    expect(name).toMatch(/anthony stark/i);
    expect(header.hasLanguageSelector()).toBe(true);
  });

  it("opens and dismisses the preferences modal from the ⚙ control", async () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    expect(header.hasSettings()).toBe(true);
    expect(header.prefsOpen()).toBe(false);

    await header.openPrefs();
    expect(header.prefsOpen()).toBe(true);

    await header.closePrefs();
    expect(header.prefsOpen()).toBe(false);
  });
});
