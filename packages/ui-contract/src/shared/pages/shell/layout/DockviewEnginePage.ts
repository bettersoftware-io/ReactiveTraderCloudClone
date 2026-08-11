import { waitFor, within } from "@testing-library/dom";
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

  /** Visible dockview tab titles, in DOM order. `.dv-default-tab-content` is
   * dockview-core 7.0.4's own stable tab-label class (verified against the
   * real rendered DOM — see the Task 4 report for the scratch dump this was
   * confirmed against); it is the ONLY element carrying just the label text,
   * so no de-duplication is needed against a broader selector like the
   * `.dv-tab` wrapper (which also contains the close-action SVG). */
  tabTitles(): readonly string[] {
    return [...this.root.querySelectorAll(".dv-default-tab-content")]
      .map((el) => {
        return el.textContent?.trim() ?? "";
      })
      .filter((t) => {
        return t.length > 0;
      });
  }

  bodyVisible(testid: string): boolean {
    return within(this.root).queryByTestId(testid) !== null;
  }

  /** Resolves once the host's `data-saved` counter reaches ≥1 (a
   * `store.save` happened) — `createDockEngine`'s `onDidLayoutChange` is
   * microtask-deferred, so a spec awaits this rather than asserting
   * synchronously. */
  async waitForSave(): Promise<void> {
    await waitFor(() => {
      if (Number(this.hostEl().getAttribute("data-saved") ?? "0") < 1) {
        throw new Error("DockviewLayoutEngine has not saved a layout yet");
      }
    });
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
