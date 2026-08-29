import { fireEvent, waitFor, within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

export interface DockviewEngineProps {
  /** A blob pre-seeded into the host's InMemoryDockLayoutStore under the "fx"
   * tab before mount, so the bridge's first load() call sees it. Pass a
   * malformed string to exercise the corrupt-blob → seed fallback (Task 3's
   * createDockEngine already owns that fallback; this proves the bridge
   * wires it through). */
  seedBlob?: string;
  /** Mirrors LayoutEngine's headRegistry seam: mount with a custom head-slot
   * test double (testid "custom-head") for one panel (fx-rates). */
  withHeads?: boolean;
  /** Mirrors the LayoutMachine's `state.maximized` the real WorkspaceEngine
   * threads into the bridge's `maximized` prop. */
  maximized?: string | null;
  /** Mirrors the LayoutMachine's `state.collapsed`, threaded into the bridge's
   * `collapsed` prop the same way. */
  collapsed?: readonly string[];
  /** The host owns the collapse set (seeded from `collapsed`) and renders a
   * toggle for fx-analytics — see `toggleAnalyticsCollapsed`. */
  interactive?: boolean;
  /** `"no-maximize"`: fx-blotter `maximizable: false`, fx-positions absent
   * from the specs entirely. */
  specsVariant?: "no-maximize";
}

/** Page object for DockviewLayoutEngine (the React bridge, Task 4). Unlike
 * LayoutEnginePage (a dumb renderer of a LayoutState this harness drives
 * directly), Dockview owns its own geometry/persistence internally — this
 * page asserts the render CONTRACT (engine/groups witnesses, panel content
 * mounted through the registry, tab titles, the head-slot seam) and the
 * store round-trip the host mirrors onto `data-saved`/`data-saved-blob`. */
export class DockviewEnginePage extends MountedComponent<DockviewEngineProps> {
  // `this.root` (PageContext.root) is the driver's OWN wrapping element
  // (React: RTL's render() container), not the component's rendered root —
  // every attribute lookup below queries a testid'd descendant instead of
  // reading off `this.root` directly (matches every other page object's
  // idiom: `within(this.root).getByTestId(...)`).
  private engineEl(): HTMLElement {
    return within(this.root).getByTestId("layout-engine");
  }

  private hostEl(): HTMLElement {
    return within(this.root).getByTestId("dockview-engine-host");
  }

  engineAttr(): string | null {
    return this.engineEl().getAttribute("data-engine");
  }

  groupsAttr(): string | null {
    return this.engineEl().getAttribute("data-groups");
  }

  /** The collapse set the bridge received, as ids in prop order. Dockview
   * emulates collapse by clamping a group's WIDTH — an internal size that
   * leaves no DOM trace — so this witnesses the wiring while
   * `createDockEngine`'s own tests cover the clamping itself. */
  collapsedIds(): readonly string[] {
    const raw = this.engineEl().getAttribute("data-collapsed") ?? "";

    return raw === "" ? [] : raw.split(" ");
  }

  /** The text of each dockview tab, in DOM order. `.rtc-dock-tab` is the
   * mount point @rtc/layout-dockview's HookTabRenderer hands the bridge
   * inside dockview's own `.dv-tab` wrapper; the bridge portals the panel's
   * head slot (or its title tab) into it, so this reads whatever the panel
   * header shows — the same nodes the in-house engine renders. */
  tabTitles(): readonly string[] {
    return [...this.root.querySelectorAll(".rtc-dock-tab")]
      .map((el) => {
        return el.textContent?.trim() ?? "";
      })
      .filter((t) => {
        return t.length > 0;
      });
  }

  /** True when the element carrying `testid` sits INSIDE dockview's own
   * `.dv-tab` wrapper — its drag surface — which is what makes the app's
   * header the thing the user drags. */
  insideDockTab(testid: string): boolean {
    return within(this.root).queryByTestId(testid)?.closest(".dv-tab") !== null;
  }

  /** The LayoutMachine intents the bridge dispatched, in call order, as the
   * host records them: `maximize:<id>`, `restore`, `collapse:<id>`,
   * `expand:<id>`. */
  intents(): readonly string[] {
    const raw = this.hostEl().getAttribute("data-intents") ?? "";

    return raw === "" ? [] : raw.split(" ");
  }

  /** Flips fx-analytics in/out of the host-owned collapse set (needs
   * `interactive`) — a real prop change into the bridge, not a remount. */
  toggleAnalyticsCollapsed(): void {
    fireEvent.click(
      within(this.root).getByTestId("host-toggle-analytics-collapsed"),
    );
  }

  /** Whether the engine is mid-glide: the `data-dock-glide` attribute
   * @rtc/layout-dockview sets on the bridge's container around an intent,
   * which its stylesheet keys the in-house 0.34s geometry transition on. */
  gliding(): boolean {
    return this.root.querySelector("[data-dock-glide]") !== null;
  }

  clickCollapse(panelId: string): void {
    fireEvent.click(within(this.root).getByTestId(`panel-${panelId}-collapse`));
  }

  clickMaximize(panelId: string): void {
    fireEvent.click(within(this.root).getByTestId(`panel-${panelId}-maximize`));
  }

  /** The stripped panel's restore bar, keyed by the same collapse testid
   * the in-house engine uses for it, or null when the panel is not a strip
   * (its header control carries the testid then, without `data-orientation`). */
  stripOrientation(panelId: string): string | null {
    return (
      within(this.root)
        .queryByTestId(`panel-${panelId}-collapse`)
        ?.getAttribute("data-orientation") ?? null
    );
  }

  /** The `data-dock-strip` marker on `panelId`'s tab mount — the hook
   * @rtc/layout-dockview's stylesheet keys on to hide the whole group
   * header while the panel is a strip (a CSS `:has()` rule jsdom does not
   * evaluate, so the marker is the witness here; the pixel tier sees the
   * hidden bar). */
  stripMarked(panelId: string): boolean {
    return (
      within(this.root)
        .queryByTestId(`dock-tab-${panelId}`)
        ?.getAttribute("data-dock-strip") === "true"
    );
  }

  bodyVisible(testid: string): boolean {
    return within(this.root).queryByTestId(testid) !== null;
  }

  /** Resolves once the host's `data-saved` counter reaches ≥1 (a
   * `store.save` happened) — `createDockEngine`'s `onDidLayoutChange` is
   * microtask-deferred, so a spec awaits this rather than asserting
   * synchronously. */
  async waitForSave(): Promise<void> {
    await waitFor(
      () => {
        if (Number(this.hostEl().getAttribute("data-saved") ?? "0") < 1) {
          throw new Error("DockviewLayoutEngine has not saved a layout yet");
        }
      },
      // Explicit, generous timeout: the bridge's real save debounce (250ms)
      // races waitFor's 1s default too closely on a loaded CI runner.
      { timeout: 3000 },
    );
  }

  /** True when the host's last-saved blob JSON.parses and mentions the
   * fx-rates panel id (proof the persisted blob is a real dockview
   * serialisation, not a stub). */
  savedBlobParses(): boolean {
    const blob = this.hostEl().getAttribute("data-saved-blob");

    if (blob === null) {
      return false;
    }

    try {
      JSON.parse(blob);
    } catch {
      return false;
    }

    return blob.includes("fx-rates");
  }
}
