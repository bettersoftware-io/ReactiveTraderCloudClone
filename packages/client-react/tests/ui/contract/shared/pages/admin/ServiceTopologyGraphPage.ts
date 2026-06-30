import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for ServiceTopologyGraph. Queries topology nodes by the text
 * content of their SVG <text> label child — individual nodes carry
 * data-status but not data-testid (no data-testid="topology-node-<name>"
 * attribute exists on the component; reported as a gap).
 */
export class ServiceTopologyGraphPage extends MountedComponent<
  Record<string, never>
> {
  private container(): HTMLElement {
    return within(this.root).getByTestId("admin-topology");
  }

  /** True when the "NO TOPOLOGY DATA" placeholder is shown. */
  isEmpty(): boolean {
    return within(this.root).queryByText(/NO TOPOLOGY DATA/i) !== null;
  }

  /**
   * Return the <g> element for the named service, or null if absent.
   * Identifies nodes by the text content of their SVG <text> label child.
   * (data-testid="topology-node-<name>" is absent from the component —
   * this selector is the best available alternative.)
   */
  nodeForService(name: string): Element | null {
    const svg = this.container().querySelector("svg");
    if (!svg) return null;
    const gs = svg.querySelectorAll<SVGGElement>("g[data-status]");

    for (const g of gs) {
      const textEl = g.querySelector("text");
      if (textEl?.textContent?.trim() === name) return g;
    }

    return null;
  }

  /** Return the data-status attribute value of the named service node, or null. */
  nodeStatus(name: string): string | null {
    return this.nodeForService(name)?.getAttribute("data-status") ?? null;
  }

  /** Return true when the named service node is present in the SVG. */
  hasNode(name: string): boolean {
    return this.nodeForService(name) !== null;
  }
}
