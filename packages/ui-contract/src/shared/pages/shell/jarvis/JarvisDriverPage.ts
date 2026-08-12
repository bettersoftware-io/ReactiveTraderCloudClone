import { within } from "@testing-library/dom";
import {
  MountedComponent,
  type PageContext,
} from "@ui-contract/harness/component";

import {
  HeaderChromePage,
  type HeaderChromeProps,
} from "../chrome/HeaderChromePage";
import {
  LayoutEnginePage,
  type LayoutEngineProps,
} from "../layout/LayoutEnginePage";
import { JarvisOrbPage } from "./JarvisOrbPage";
import { JarvisOverlayPage } from "./JarvisOverlayPage";
import { JarvisPanelLayerPage } from "./JarvisPanelLayerPage";

/**
 * Page object for the real `App` shell, mounted whole (Task 12/P5) — the
 * `AppShell` component token. Unlike every other page object in this tree,
 * this one deliberately mounts the PRODUCTION top-level composition (not a
 * synthetic composite like `FxBlotterWorkspace`/`LiveRatesWorkspace`): the
 * driven-pulse cue on the nav rail AND the workspace wrapper, the real
 * `useWorkspaceNav()`-backed tab switch, and the real per-tab
 * `InhouseLayoutEngine` a driven "layout" command targets are all owned by
 * `App.tsx` itself, so nothing shallower than the real shell can witness
 * them together. Composes the SAME page objects every other Jarvis spec
 * already uses (`HeaderChromePage`/`JarvisOverlayPage`/`JarvisOrbPage`/
 * `JarvisPanelLayerPage`), constructed over the identical `PageContext` —
 * every one of their methods is a pure DOM query against `ctx.root`, so
 * sharing one root across all four is exactly as correct as `mountWith`-ing
 * each of them separately on one World (the `JarvisPanelLayer.contract.spec.ts`
 * precedent), just without the redundant separate mounts. `HeaderChromePage`
 * in particular never reads `HeaderChromeProps` off its own `ctx` (every
 * accessor is a DOM query), so passing this token's props-less context
 * through the cast below is safe.
 */
export class JarvisDriverPage extends MountedComponent<Record<string, never>> {
  readonly header: HeaderChromePage;

  readonly overlay: JarvisOverlayPage;

  readonly orb: JarvisOrbPage;

  readonly panels: JarvisPanelLayerPage;

  /** The ACTIVE tab's `InhouseLayoutEngine`, read through the same page object
   * `LayoutEngine.contract.spec.ts` drives standalone — the only way to
   * witness a DOCKED desk panel, which renders as a `panel-<id>` leaf inside
   * this engine rather than in `panels` (the floating layer). Same
   * props-context cast as `header` above: every `LayoutEnginePage` accessor is
   * a pure DOM query against `ctx.root` and none reads `LayoutEngineProps`. */
  readonly layout: LayoutEnginePage;

  constructor(ctx: PageContext<Record<string, never>>) {
    super(ctx);
    const asHeaderCtx = ctx as unknown as PageContext<HeaderChromeProps>;
    this.header = new HeaderChromePage(asHeaderCtx);
    this.overlay = new JarvisOverlayPage(ctx);
    this.orb = new JarvisOrbPage(ctx);
    this.panels = new JarvisPanelLayerPage(ctx);
    this.layout = new LayoutEnginePage(
      ctx as unknown as PageContext<LayoutEngineProps>,
    );
  }

  /** Every element carrying `data-jarvis-driven` in the mounted shell — the
   * nav rail (`<nav>`, HeaderChrome's own pulse) and the workspace wrapper
   * (`<div>`, App.tsx's own pulse) both flash independently off the SAME
   * `useJarvisDrivenPulse()` source (Task 10's two-caller doc), so a
   * driven batch's applied command pulses BOTH. Neither carries its own
   * testid (App.tsx's workspace-region `<div>` is otherwise anonymous), so
   * this disambiguates by tag name rather than adding a testid this task
   * doesn't otherwise need. */
  private drivenElements(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>("[data-jarvis-driven]")];
  }

  /** True while the nav rail (HeaderChrome's `<nav aria-label="Workspace">`)
   * is mid driven-pulse. */
  isNavDriven(): boolean {
    const nav = this.drivenElements().find((el) => {
      return el.tagName === "NAV";
    });
    return nav?.getAttribute("data-jarvis-driven") === "true";
  }

  /** True while the workspace wrapper (App.tsx's own driven region, wrapping
   * the active tab's `InhouseLayoutEngine`) is mid driven-pulse. */
  isWorkspaceRegionDriven(): boolean {
    const region = this.drivenElements().find((el) => {
      return el.tagName === "DIV";
    });
    return region?.getAttribute("data-jarvis-driven") === "true";
  }

  /** The active tab's `InhouseLayoutEngine` root (`data-testid="layout-engine"`)
   * — present once the active tab's `WorkspaceEngine` has mounted (always,
   * post-mount: `App` renders exactly one tab's tree at a time). */
  private layoutEngine(): HTMLElement {
    return within(this.root).getByTestId("layout-engine");
  }

  /** The active tab's currently-maximized panel id (`data-maximized`), or
   * `""` when nothing is maximized — mirrors `InhouseLayoutEngine`'s own
   * `state.maximized ?? ""` render. */
  maximizedPanelId(): string {
    return this.layoutEngine().getAttribute("data-maximized") ?? "";
  }

  /** True while the given panel id's own wrapper (`panel-${id}`) reports
   * itself maximized (`data-maximized="true"`) — the per-panel counterpart
   * to {@link maximizedPanelId}'s layout-engine-level read. */
  isPanelMaximized(panelId: string): boolean {
    const panel = within(this.root).queryByTestId(`panel-${panelId}`);
    return panel?.getAttribute("data-maximized") === "true";
  }
}
