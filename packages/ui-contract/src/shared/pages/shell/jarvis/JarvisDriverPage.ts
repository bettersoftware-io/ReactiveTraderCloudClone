import { within } from "@testing-library/dom";
import {
  MountedComponent,
  type PageContext,
} from "@ui-contract/harness/component";
import { WatchlistPanelPage } from "@ui-contract/pages/equities/WatchlistPanelPage";

import {
  HeaderChromePage,
  type HeaderChromeProps,
} from "../chrome/HeaderChromePage";
import { ViewMenuPage } from "../chrome/ViewMenuPage";
import {
  DockviewEnginePage,
  type DockviewEngineProps,
} from "../layout/DockviewEnginePage";
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

  /** The active tab's engine, read through `DockviewEnginePage` instead — the
   * witnesses `layout` above uses (`panel-<id>` leaf wrappers) don't exist
   * under the Dockview bridge; a spec that seeds `world.layoutEngine` to
   * `"dockview"` before mounting reads the SAME root through this page
   * object instead (Task 7, carried from Task 4's review: proves the fakes'
   * per-tab docked derivation — `dockedPanelIdsFor` / `merge(bridge.panels$,
   * dock.kick$)` in `viewModelFromWorld.ts` — runs under the real
   * `DockviewLayoutEngine`, not just the in-house engine `layout` exercises
   * above). Same props-context cast as `layout`: every `DockviewEnginePage`
   * accessor is a pure DOM query against `ctx.root`. */
  readonly dockviewLayout: DockviewEnginePage;

  /** The app head's View dropdown (Phase 3 close/reopen) — pure DOM queries
   * like `header`, so the props-less context passes straight through. */
  readonly viewMenu: ViewMenuPage;

  /** The equities tab's watchlist rail (once that tab is active) — pure DOM
   * queries against the shared root like every page above, so the props-less
   * context passes straight through. Lets a spec drive the open-chart row
   * affordance AND read the engine it opens into from one mounted shell. */
  readonly watchlist: WatchlistPanelPage;

  constructor(ctx: PageContext<Record<string, never>>) {
    super(ctx);
    const asHeaderCtx = ctx as unknown as PageContext<HeaderChromeProps>;
    this.header = new HeaderChromePage(asHeaderCtx);
    this.viewMenu = new ViewMenuPage(ctx);
    this.watchlist = new WatchlistPanelPage(ctx);
    this.overlay = new JarvisOverlayPage(ctx);
    this.orb = new JarvisOrbPage(ctx);
    this.panels = new JarvisPanelLayerPage(ctx);
    this.layout = new LayoutEnginePage(
      ctx as unknown as PageContext<LayoutEngineProps>,
    );
    this.dockviewLayout = new DockviewEnginePage(
      ctx as unknown as PageContext<DockviewEngineProps>,
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
   * `state.maximized ?? ""` render, which the Dockview bridges render too.
   *
   * THROWS when the attribute is absent rather than reporting it as `""`.
   * Both engines render the witness unconditionally, so "no attribute" is
   * never a layout state — it means this engine stopped publishing it. The
   * old `?? ""` collapsed that into the same answer as "nothing is
   * maximized", which is what every `toBe("")` assertion expects: those
   * passed against an engine carrying no witness at all, checking nothing.
   * See the engine-parity block in `LayoutEngine.contract.spec.ts`. */
  maximizedPanelId(): string {
    const engine = this.layoutEngine();
    const witness = engine.getAttribute("data-maximized");

    if (witness === null) {
      throw new Error(
        `layout-engine (data-engine="${engine.getAttribute("data-engine") ?? "inhouse"}") renders no data-maximized attribute — ` +
          "the maximize witness is missing, which is NOT the same as nothing being maximized. " +
          "Every engine must render it; see DockviewLayoutEngine's <main> element.",
      );
    }

    return witness;
  }

  /** True while the given panel id's own wrapper (`panel-${id}`) reports
   * itself maximized (`data-maximized="true"`) — the per-panel counterpart
   * to {@link maximizedPanelId}'s layout-engine-level read.
   *
   * Under Dockview there is often no per-panel wrapper to read: only a
   * Jarvis-DOCKED panel tags its dockview group with `panel-${id}`, and a
   * group can hold several stacked panels, so tagging every one would be
   * wrong. The fallback is exact rather than approximate — in-house derives
   * BOTH attributes from the same `state.maximized` (`data-maximized=
   * {state.maximized === panelId}` per panel against `state.maximized ?? ""`
   * at the root), so the root witness answers this question identically. The
   * per-panel attribute's real job is the CSS hook `.panel[data-maximized=
   * "true"]`.
   *
   * Never reports absence as a clean `false`: a wrapper that exists WITHOUT
   * the witness throws, and the root fallback throws when the root witness is
   * itself missing. */
  isPanelMaximized(panelId: string): boolean {
    const panel = within(this.root).queryByTestId(`panel-${panelId}`);

    if (panel === null) {
      return this.maximizedPanelId() === panelId;
    }

    const witness = panel.getAttribute("data-maximized");

    if (witness === null) {
      throw new Error(
        `panel "${panelId}" has a wrapper but renders no data-maximized attribute — the per-panel ` +
          "maximize witness is missing, which is NOT the same as the panel not being maximized.",
      );
    }

    return witness === "true";
  }
}
