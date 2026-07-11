import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for ThemePicker. The skin rows + the reused ThemeToggle both write
 * through the real theme seam; the ThemeProvider publishes the result on the
 * document root (`dataset.skin` / `dataset.mode`), which is asserted here rather
 * than any colour value — keeping the spec framework-neutral.
 *
 * The skin picker is a compact dropdown: rows only exist in the DOM while the
 * `skin-picker` trigger's popover is open, so most queries below require
 * {@link ThemePickerPage.openMenu} first.
 */
export class ThemePickerPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  /** True while the skin dropdown popover is open. */
  isMenuOpen(): boolean {
    return (
      within(this.root).queryByRole("listbox", { name: /theme skin/i }) !== null
    );
  }

  /** Open the skin dropdown via its trigger (no-op if already open). */
  async openMenu(): Promise<void> {
    if (this.isMenuOpen()) {
      return;
    }

    await this.user.click(within(this.root).getByTestId("skin-picker"));
  }

  /** Close the open skin dropdown via Escape. */
  async closeMenuWithEscape(): Promise<void> {
    await this.user.keyboard("{Escape}");
  }

  /** Press a non-Escape key at document scope — proves the keydown handler's
   *  `event.key === "Escape"` guard leaves every other key alone. */
  async pressNonEscapeKey(): Promise<void> {
    await this.user.keyboard("a");
  }

  /** Close the open skin dropdown by clicking outside it (document.body). */
  async closeMenuWithOutsideClick(): Promise<void> {
    await this.user.click(document.body);
  }

  /** Every selectable skin, in render order (menu must be open). */
  skinOptions(): string[] {
    return within(this.root)
      .getAllByRole("option")
      .map((el) => {
        return el.getAttribute("data-skin") ?? "";
      });
  }

  /** The currently-selected skin (the row marked data-active="true"; menu must be open). */
  activeSkin(): string {
    const active = within(this.root)
      .getAllByRole("option")
      .find((el) => {
        return el.getAttribute("data-active") === "true";
      });
    return active?.getAttribute("data-skin") ?? "";
  }

  /** The active skin as published by the ThemeProvider on the document root. */
  documentSkin(): string {
    return document.documentElement.dataset.skin ?? "";
  }

  /** The active mode as published by the ThemeProvider on the document root. */
  documentMode(): string {
    return document.documentElement.dataset.mode ?? "";
  }

  /** The theme-mode toggle's accessible label (the reused ThemeToggle). */
  modeAriaLabel(): string {
    return (
      within(this.root)
        .getByTestId("theme-toggle")
        .getAttribute("aria-label") ?? ""
    );
  }

  /** Open the dropdown (if needed) and select a skin through the seam. */
  async selectSkin(skin: string): Promise<void> {
    await this.openMenu();
    const row = within(this.root)
      .getAllByRole("option")
      .find((el) => {
        return el.getAttribute("data-skin") === skin;
      });

    if (!row) {
      throw new Error(`no skin row for "${skin}"`);
    }

    await this.user.click(row);
  }

  /** Flip the theme mode through the reused ThemeToggle. */
  async toggleMode(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("theme-toggle"));
  }
}
