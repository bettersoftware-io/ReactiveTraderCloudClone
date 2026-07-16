import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

/** The real workspace tabs the header switches between (equities wired in Phase 4). */
export type WorkspaceTab = "fx" | "credit" | "equities" | "admin";

export interface HeaderChromeProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
}

interface AccountMeta {
  id: string;
  desk: string;
  clearance: string;
}

export class HeaderChromePage extends MountedComponent<HeaderChromeProps> {
  private readonly user: UserEvent = userEvent.setup();

  /** True when the header landmark (data-testid="header") is rendered. */
  isRendered(): boolean {
    return within(this.root).queryByTestId("header") !== null;
  }

  /** The wordmark text shown in the header. */
  wordmark(): string {
    return (
      within(this.root)
        .getByText(/reactive trader/i)
        .textContent?.trim() ?? ""
    );
  }

  /** The visible label for each real tab button, in nav order. */
  tabLabels(): string[] {
    return (["fx", "credit", "equities", "admin"] as const).map((tab) => {
      return (
        within(this.root).getByTestId(`tab-${tab}`).textContent?.trim() ?? ""
      );
    });
  }

  /** True when the given real tab is the active (highlighted) one. */
  isActive(tab: WorkspaceTab): boolean {
    const button = within(this.root).getByTestId(`tab-${tab}`);
    return button.dataset.active === "true";
  }

  /** True when the given tab renders with the uppercase outlined-pill nav
   *  class (the CSS-module class carries `text-transform: uppercase` — jsdom
   *  doesn't apply stylesheet rules, so the contract tier asserts the class
   *  is wired rather than the computed style; pixel fidelity is the visual
   *  tier's job). */
  hasNavPillClass(tab: WorkspaceTab): boolean {
    const button = within(this.root).getByTestId(`tab-${tab}`);
    return button.className.includes("navButton");
  }

  /** Click one of the real workspace tabs (fires onTabChange). */
  async clickTab(tab: WorkspaceTab): Promise<void> {
    await this.user.click(within(this.root).getByTestId(`tab-${tab}`));
  }

  /** The fixed environment badge text (decorative). */
  envBadge(): string {
    return within(this.root).getByTestId("env-badge").textContent?.trim() ?? "";
  }

  /** True when the theme picker (skin + mode) is present. */
  hasThemePicker(): boolean {
    return within(this.root).queryByTestId("skin-picker") !== null;
  }

  /** True when the theme-mode toggle (reused ThemeToggle) is present. */
  hasThemeToggle(): boolean {
    return within(this.root).queryByTestId("theme-toggle") !== null;
  }

  /** True when the notifications control is present (decorative). */
  hasNotifications(): boolean {
    return within(this.root).queryByTestId("notifications-toggle") !== null;
  }

  /** Open the notifications dropdown and return its message rows. */
  async openNotifications(): Promise<string[]> {
    await this.user.click(
      within(this.root).getByTestId("notifications-toggle"),
    );
    const panel = within(this.root).getByTestId("notifications-panel");
    return within(panel)
      .getAllByRole("listitem")
      .map((el) => {
        return el.textContent?.trim() ?? "";
      });
  }

  /** The open notifications panel's MARK ALL READ footer label ("" when
   *  absent). Assumes the notifications panel is already open. */
  notificationsFooterLabel(): string {
    return (
      within(this.root)
        .queryByTestId("notifications-mark-read")
        ?.textContent?.trim() ?? ""
    );
  }

  /** Click MARK ALL READ (decorative: closes the panel) and report whether
   *  the notifications panel is still open afterwards. */
  async markAllNotificationsRead(): Promise<boolean> {
    await this.user.click(
      within(this.root).getByTestId("notifications-mark-read"),
    );
    return within(this.root).queryByTestId("notifications-panel") !== null;
  }

  /** The account trigger's initials (wired to the session seam). */
  accountInitials(): string {
    return (
      within(this.root).getByTestId("account-toggle").textContent?.trim() ?? ""
    );
  }

  /** Open the account dropdown and return the operator name shown. */
  async openAccount(): Promise<string> {
    await this.user.click(within(this.root).getByTestId("account-toggle"));
    const panel = within(this.root).getByTestId("account-panel");
    return (
      within(panel)
        .getByText(/anthony stark/i)
        .textContent?.trim() ?? ""
    );
  }

  /** The operator email shown in the account panel's identity head.
   *  Assumes the account panel is already open. */
  accountEmail(): string {
    return (
      within(this.root).getByTestId("account-email").textContent?.trim() ?? ""
    );
  }

  /** The account panel's TRADER ID / DESK / CLEARANCE detail row values.
   *  Assumes the account panel is already open. */
  accountMeta(): AccountMeta {
    return {
      id: this.accountMetaRow("id"),
      desk: this.accountMetaRow("desk"),
      clearance: this.accountMetaRow("clearance"),
    };
  }

  private accountMetaRow(field: "id" | "desk" | "clearance"): string {
    const row = within(this.root).getByTestId(`account-meta-${field}`);
    // Row is "KEY  VALUE" (two spans); the value is the second.
    const value = row.children[1];
    return value?.textContent?.trim() ?? "";
  }

  /** True when the account dropdown panel is currently open. */
  accountPanelOpen(): boolean {
    return within(this.root).queryByTestId("account-panel") !== null;
  }

  /** Click the invisible click-away backdrop behind an open dropdown. */
  async clickMenuBackdrop(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("menu-backdrop"));
  }

  /** True when the standalone language menu control is present in the header. */
  hasLanguageMenu(): boolean {
    return within(this.root).queryByTestId("language-toggle") !== null;
  }

  /** The language menu trigger's current label (e.g. "EN"). */
  languageTriggerLabel(): string {
    return (
      within(this.root).getByTestId("language-toggle").textContent?.trim() ?? ""
    );
  }

  /** Open the language menu (no-op if already open) and select the given
   *  language code, returning the trigger's new label. */
  async selectLanguage(code: string): Promise<string> {
    if (within(this.root).queryByTestId("language-panel") === null) {
      await this.user.click(within(this.root).getByTestId("language-toggle"));
    }

    await this.user.click(
      within(this.root).getByTestId(`language-option-${code}`),
    );
    return this.languageTriggerLabel();
  }

  /** Open the language menu (no-op if already open) and return the visible
   *  option labels. */
  async openLanguageMenu(): Promise<string[]> {
    if (within(this.root).queryByTestId("language-panel") === null) {
      await this.user.click(within(this.root).getByTestId("language-toggle"));
    }

    const panel = within(this.root).getByTestId("language-panel");
    return within(panel)
      .getAllByRole("menuitemradio")
      .map((el) => {
        return el.textContent?.trim() ?? "";
      });
  }

  /** Click ⟳ Reboot HUD inside the account panel (replays the splash via the seam). */
  async rebootHud(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("account-reboot"));
  }

  /** True when the ⟳ Reboot HUD row is present in the open account panel. */
  hasRebootRow(): boolean {
    return within(this.root).queryByTestId("account-reboot") !== null;
  }

  /** Number of times the boot-gate reboot command was invoked through the seam. */
  rebootCount(): number {
    return this.commandLog().bootReboot;
  }

  /** Click LOCK SESSION inside the account panel (locks the session via the seam). */
  async lockSession(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("account-lock"));
  }

  /** Number of times the session-lock command was invoked through the seam. */
  lockCount(): number {
    return this.commandLog().authLock;
  }

  /** Click SIGN OUT inside the account panel (logs the session out via the seam). */
  async clickLogout(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("account-logout"));
  }

  /** Number of times the logout command was invoked through the seam. */
  logoutCount(): number {
    return this.commandLog().authLogout;
  }

  /** True when the ⚙ Preferences row is present in the open account panel. */
  hasSettings(): boolean {
    return within(this.root).queryByTestId("account-prefs") !== null;
  }

  /** True when the preferences modal is currently open. */
  prefsOpen(): boolean {
    return within(this.root).queryByTestId("prefs-modal") !== null;
  }

  /** Open the preferences modal via the account menu's ⚙ Preferences row
   *  (opens the account panel first when it isn't already open). */
  async openPrefs(): Promise<void> {
    if (!this.accountPanelOpen()) {
      await this.user.click(within(this.root).getByTestId("account-toggle"));
    }

    await this.user.click(within(this.root).getByTestId("account-prefs"));
  }

  /** Dismiss the preferences modal via its ✕ control. */
  async closePrefs(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("prefs-close"));
  }
}
