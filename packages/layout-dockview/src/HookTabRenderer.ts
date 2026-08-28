import type { ITabRenderer, TabPartInitParameters } from "dockview";

import type { DockPanelHooks } from "#/createDockEngine";

/**
 * The panel's tab — dockview's drag surface — as a mount point for the app's
 * own header content. With a `mountTab` hook the client portals the SAME
 * head-slot / title nodes its in-house engine renders straight into this
 * element, so dockview's tab bar IS the panel header rather than a second,
 * foreign header stacked above it. Without the hook it degrades to a plain
 * title label.
 *
 * Either way the tab deliberately carries no close (×) action: panel
 * close/reopen is out of v1 scope — a closed panel has no path back, so the
 * default close button is a data-loss trap. No dockview-core option
 * suppresses only the close action (verified against the installed 7.0.4
 * `.d.ts`: `DockviewComponentOptions` has no `closeable`/`disableClose`-style
 * flag), so this replaces the default tab renderer entirely via
 * `createTabComponent` rather than hiding the button with CSS — the close
 * action element is never created at all, not merely hidden.
 */
export class HookTabRenderer implements ITabRenderer {
  readonly element: HTMLElement;

  private disposeMounted: (() => void) | null = null;

  constructor(private readonly hooks: DockPanelHooks) {
    this.element = document.createElement("div");
    this.element.className = "rtc-dock-tab";
  }

  init(parameters: TabPartInitParameters): void {
    const mountTab = this.hooks.mountTab;

    if (mountTab !== undefined) {
      this.disposeMounted = mountTab(parameters.api.id, this.element);
      return;
    }

    const title = document.createElement("div");
    title.className = "rtc-dock-tab-title";
    title.textContent = parameters.title;
    this.element.appendChild(title);
    const sub = parameters.api.onDidTitleChange((event) => {
      title.textContent = event.title;
    });

    this.disposeMounted = (): void => {
      sub.dispose();
      title.remove();
    };
  }

  dispose(): void {
    this.disposeMounted?.();
    this.disposeMounted = null;
  }
}
