import { HeaderChrome } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import type { WorkspaceTab } from "@ui-contract/pages/shell/chrome/HeaderChromePage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  delete document.documentElement.dataset.mode;
  delete document.documentElement.dataset.skin;
});

afterEach(() => {
  return cleanupMounted();
});

describe("HeaderChrome", () => {
  it("renders the header landmark, wordmark and the four real workspace tabs", () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    expect(header.isRendered()).toBe(true);
    expect(header.wordmark()).toMatch(/reactive trader/i);
    expect(header.tabLabels()).toEqual(["FX", "Credit", "Equities", "Admin"]);
  });

  it("reports an Equities tab click through onTabChange (wired in Phase 4)", async () => {
    const changes: WorkspaceTab[] = [];
    const header = mount(HeaderChrome, {
      props: {
        activeTab: "fx",
        onTabChange: (tab: WorkspaceTab) => {
          return changes.push(tab);
        },
      },
    });
    await header.clickTab("equities");
    expect(changes).toEqual(["equities"]);
    expect(header.isActive("fx")).toBe(true);
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

  it("exposes a power-saver quick toggle that flips aria-pressed", async () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
      powerSaver: false,
    });
    expect(header.powerSaverPressed()).toBe("false");
    await header.clickPowerSaver();
    expect(header.powerSaverPressed()).toBe("true");
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

  it("closes the notifications dropdown from its MARK ALL READ footer", async () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    await header.openNotifications();
    expect(header.notificationsFooterLabel()).toBe("MARK ALL READ");
    expect(await header.markAllNotificationsRead()).toBe(false);
  });

  it("wires the account menu to the session seam and shows the operator's identity rows", async () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    expect(header.accountInitials()).toMatch(/AS/);
    const name = await header.openAccount();
    expect(name).toMatch(/anthony stark/i);
    expect(header.accountEmail()).toBe("a.stark@reactivetrader.io");
    expect(header.accountMeta()).toEqual({
      id: "TRD-0042",
      desk: "G10 Spot · London",
      clearance: "LEVEL 4 · FULL",
    });
  });

  it("closes the account menu from the click-away backdrop", async () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    await header.openAccount();
    expect(header.accountPanelOpen()).toBe(true);
    await header.clickMenuBackdrop();
    expect(header.accountPanelOpen()).toBe(false);
  });

  it("renders every nav tab with the uppercase outlined-pill class", () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    expect(header.hasNavPillClass("fx")).toBe(true);
    expect(header.hasNavPillClass("credit")).toBe(true);
    expect(header.hasNavPillClass("equities")).toBe(true);
    expect(header.hasNavPillClass("admin")).toBe(true);
    // Labels stay mixed-case in code — the CSS module class applies the
    // `text-transform: uppercase` visual treatment (pixel fidelity verified
    // by the visual golden tier).
    expect(header.tabLabels()).toEqual(["FX", "Credit", "Equities", "Admin"]);
  });

  it("opens the standalone decorative language menu and relabels the trigger on selection", async () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    expect(header.hasLanguageMenu()).toBe(true);
    expect(header.languageTriggerLabel()).toMatch(/^EN/);

    const options = await header.openLanguageMenu();
    expect(options.join(" ")).toMatch(/English/);
    expect(options.join(" ")).toMatch(/中文 \(简体\)/);
    expect(options.join(" ")).toMatch(/日本語/);
    expect(options.join(" ")).toMatch(/Deutsch/);
    expect(options.join(" ")).toMatch(/Français/);
    expect(options.join(" ")).toMatch(/Español/);

    const newLabel = await header.selectLanguage("DE");
    expect(newLabel).toMatch(/^DE/);
  });

  it("opens and dismisses the preferences modal from the account menu's ⚙ Preferences row", async () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    expect(header.prefsOpen()).toBe(false);

    await header.openAccount();
    expect(header.hasSettings()).toBe(true);

    await header.openPrefs();
    expect(header.prefsOpen()).toBe(true);

    await header.closePrefs();
    expect(header.prefsOpen()).toBe(false);
  });

  it("replays the boot splash through the seam from the account menu's ⟳ Reboot HUD row", async () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    await header.openAccount();
    expect(header.hasRebootRow()).toBe(true);
    expect(header.rebootCount()).toBe(0);
    await header.rebootHud();
    expect(header.rebootCount()).toBe(1);
    // The row closes the menu after firing, like the other action rows.
    expect(header.accountPanelOpen()).toBe(false);
  });

  it("locks the session through the seam from the account menu", async () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    await header.openAccount();
    expect(header.lockCount()).toBe(0);
    await header.lockSession();
    expect(header.lockCount()).toBe(1);
  });

  it("logs out through the seam from the account menu's SIGN OUT row", async () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
    });
    await header.openAccount();
    expect(header.logoutCount()).toBe(0);
    await header.clickLogout();
    expect(header.logoutCount()).toBe(1);
  });
});
