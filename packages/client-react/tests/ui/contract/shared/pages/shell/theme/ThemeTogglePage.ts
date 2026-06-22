import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "../../../harness/component";

/**
 * Page object for ThemeToggle. The toggle flips the real ThemeProvider's state,
 * which writes `document.documentElement.dataset.theme` — asserted here rather
 * than any colour value, keeping the spec framework-neutral.
 */
export class ThemeTogglePage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  private button(): HTMLButtonElement {
    return within(this.root).getByTestId("theme-toggle") as HTMLButtonElement;
  }

  /** The active theme as published by the ThemeProvider on the document root. */
  documentTheme(): string {
    return document.documentElement.dataset.theme ?? "";
  }

  /** The toggle's accessible label (announces the theme it would switch to). */
  ariaLabel(): string {
    return this.button().getAttribute("aria-label") ?? "";
  }

  /** Click the toggle to flip the theme. */
  async toggle(): Promise<void> {
    await this.user.click(this.button());
  }
}
