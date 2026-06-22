import { fireEvent, within } from "@testing-library/dom";

import type { Trade } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface BlotterRowProps {
  trade: Trade;
  isNew: boolean;
}

export class BlotterRowPage extends MountedComponent<BlotterRowProps> {
  private row(): HTMLTableRowElement {
    const tr = this.root.querySelector("tr");
    if (!tr) throw new Error("BlotterRow rendered no <tr>");
    return tr as HTMLTableRowElement;
  }

  /** Ordered text of each cell in the row. */
  cellText(): string[] {
    return [...this.row().querySelectorAll("td")].map((td) => {
      return td.textContent?.trim() ?? "";
    });
  }

  /** True when a cell with the given text is present. */
  hasCell(text: string): boolean {
    return within(this.row()).queryByText(text) !== null;
  }

  /** True when the row renders with the rejected (struck-through) styling. */
  isRejected(): boolean {
    return this.row().dataset.state === "rejected";
  }

  /** The row's current background colour (derived from data attributes). */
  backgroundColor(): string {
    const el = this.row();
    if (el.dataset.highlight === "true") return "rgba(59, 130, 246, 0.15)";
    if (el.dataset.hovered === "true") return "var(--bg-secondary)";
    return "transparent";
  }

  /** Move the pointer over the row (drives the hover styling). */
  hover(): void {
    // React 19 synthesises onMouseEnter from native mouseover at the root.
    fireEvent.mouseOver(this.row());
    fireEvent.mouseEnter(this.row());
    // Flush the resulting React state update through the driver's act wrapper.
    this.setProps({});
  }

  /** Move the pointer off the row. */
  unhover(): void {
    fireEvent.mouseOut(this.row());
    fireEvent.mouseLeave(this.row());
    this.setProps({});
  }
}
