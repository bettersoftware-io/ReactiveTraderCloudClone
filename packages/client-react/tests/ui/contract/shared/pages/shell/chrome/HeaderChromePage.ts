import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** The real workspace tabs the header switches between (equities wired in Phase 4). */
export type WorkspaceTab = "fx" | "credit" | "equities" | "admin";

export interface HeaderChromeProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
}

interface AccountMeta {
  email: string;
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

  /** The account panel's EMAIL / DESK / CLEARANCE identity row values.
   *  Assumes the account panel is already open. */
  accountMeta(): AccountMeta {
    return {
      email: this.accountMetaRow("email"),
      desk: this.accountMetaRow("desk"),
      clearance: this.accountMetaRow("clearance"),
    };
  }

  private accountMetaRow(field: "email" | "desk" | "clearance"): string {
    const row = within(this.root).getByTestId(`account-meta-${field}`);
    // Row is "KEY  VALUE" (two spans); the value is the second.
    const value = row.children[1];
    return value?.textContent?.trim() ?? "";
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

  /** Click LOCK SESSION inside the account panel (locks the session via the seam). */
  async lockSession(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("account-lock"));
  }

  /** Number of times the session-lock command was invoked through the seam. */
  lockCount(): number {
    return this.commandLog().sessionLock;
  }

  /** True when the ⚙ preferences control is present. */
  hasSettings(): boolean {
    return within(this.root).queryByTestId("settings-toggle") !== null;
  }

  /** True when the preferences modal is currently open. */
  prefsOpen(): boolean {
    return within(this.root).queryByTestId("prefs-modal") !== null;
  }

  /** Click the ⚙ control to open the preferences modal. */
  async openPrefs(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("settings-toggle"));
  }

  /** Dismiss the preferences modal via its ✕ control. */
  async closePrefs(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("prefs-close"));
  }
}
