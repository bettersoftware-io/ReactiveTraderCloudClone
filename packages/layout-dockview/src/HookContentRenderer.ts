import type {
  GroupPanelPartInitParameters,
  IContentRenderer,
} from "dockview-core";

import type { DockPanelHooks } from "#/createDockEngine";

/** Bridges a Dockview panel's content slot to the app's own mount hook —
 * Dockview owns `element`; the hook is responsible for filling and later
 * disposing whatever it mounts into it. */
export class HookContentRenderer implements IContentRenderer {
  readonly element: HTMLElement;

  private disposeContent: (() => void) | null = null;

  constructor(private readonly hooks: DockPanelHooks) {
    this.element = document.createElement("div");
    this.element.className = "rtc-dock-panel-content";
  }

  init(parameters: GroupPanelPartInitParameters): void {
    this.disposeContent = this.hooks.mount(parameters.api.id, this.element);
  }

  dispose(): void {
    this.disposeContent?.();
    this.disposeContent = null;
  }
}
