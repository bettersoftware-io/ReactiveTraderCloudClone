import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for ThemePicker. The skin rows + the reused ThemeToggle both write
 * through the real theme seam; the ThemeProvider publishes the result on the
 * document root (`dataset.skin` / `dataset.mode`), which is asserted here rather
 * than any colour value — keeping the spec framework-neutral.
 */
export class ThemePickerPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  /** Every selectable skin, in render order. */
  skinOptions(): string[] {
    return within(this.root)
      .getAllByRole("option")
      .map((el) => {
        return el.getAttribute("data-skin") ?? "";
      });
  }

  /** The currently-selected skin (the row marked data-active="true"). */
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

  /** Select a skin through the seam. */
  async selectSkin(skin: string): Promise<void> {
    const row = within(this.root)
      .getAllByRole("option")
      .find((el) => {
        return el.getAttribute("data-skin") === skin;
      });
    if (!row) throw new Error(`no skin row for "${skin}"`);
    await this.user.click(row);
  }

  /** Flip the theme mode through the reused ThemeToggle. */
  async toggleMode(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("theme-toggle"));
  }
}
