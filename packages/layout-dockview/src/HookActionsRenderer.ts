import type { IGroupHeaderProps, IHeaderActionsRenderer } from "dockview";

import type { DockPanelHooks } from "#/createDockEngine";

/**
 * The group's right-hand header-actions slot as a mount point for the app's
 * own per-panel controls (the in-house engine's collapse / maximize glyphs).
 * A group hosts one ACTIVE panel at a time, so the slot is remounted for the
 * active panel's id whenever the group's active panel changes — the same
 * `(panelId, element) => dispose` hook shape as tab and content, so the
 * client never has to track groups, only panels.
 */
export class HookActionsRenderer implements IHeaderActionsRenderer {
  readonly element: HTMLElement;

  private disposeMounted: (() => void) | null = null;

  private disposeSubscription: (() => void) | null = null;

  constructor(
    private readonly mountActions: NonNullable<DockPanelHooks["mountActions"]>,
  ) {
    this.element = document.createElement("div");
    this.element.className = "rtc-dock-actions";
  }

  init(parameters: IGroupHeaderProps): void {
    const remountForActivePanel = (): void => {
      this.disposeMounted?.();
      this.disposeMounted = null;
      const active = parameters.group.activePanel;

      if (active !== undefined) {
        this.disposeMounted = this.mountActions(active.id, this.element);
      }
    };

    remountForActivePanel();
    const sub = parameters.api.onDidActivePanelChange(remountForActivePanel);

    this.disposeSubscription = (): void => {
      sub.dispose();
    };
  }

  dispose(): void {
    this.disposeSubscription?.();
    this.disposeSubscription = null;
    this.disposeMounted?.();
    this.disposeMounted = null;
  }
}
