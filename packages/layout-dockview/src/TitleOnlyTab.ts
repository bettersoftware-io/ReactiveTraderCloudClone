import type { ITabRenderer, TabPartInitParameters } from "dockview";

/**
 * Renders just the panel title, deliberately omitting dockview's default tab
 * close (×) action. Panel close/reopen is out of v1 scope — a closed panel
 * has no path back, so the default close button is a data-loss trap. No
 * dockview-core option suppresses only the close action (verified against
 * the installed 7.0.4 `.d.ts`: `DockviewComponentOptions` has no
 * `closeable`/`disableClose`-style flag), so this replaces the default tab
 * renderer entirely via `createTabComponent` rather than hiding the button
 * with CSS — the close action element is never created at all, not merely
 * hidden.
 */
export class TitleOnlyTab implements ITabRenderer {
  readonly element: HTMLElement;

  private readonly titleElement: HTMLElement;

  private disposeTitleSub: (() => void) | null = null;

  constructor() {
    this.element = document.createElement("div");
    // Reuses dockview's own tab/content class names so the HUD theme's
    // existing token overrides (colours, active/inactive states) keep
    // applying unchanged — only the action button is missing.
    this.element.className = "dv-default-tab";
    this.titleElement = document.createElement("div");
    this.titleElement.className = "dv-default-tab-content";
    this.element.appendChild(this.titleElement);
  }

  init(parameters: TabPartInitParameters): void {
    this.titleElement.textContent = parameters.title;
    const sub = parameters.api.onDidTitleChange((event) => {
      this.titleElement.textContent = event.title;
    });

    this.disposeTitleSub = (): void => {
      sub.dispose();
    };
  }

  dispose(): void {
    this.disposeTitleSub?.();
    this.disposeTitleSub = null;
  }
}
