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

  /**
   * The lowercased TradeStatus the row exposes for the status-cell colour
   * (done → positive, pending → aware accent; CSS keys off `data-status`).
   */
  status(): string | undefined {
    return this.row().dataset.status;
  }

  /** The row's current background colour (derived from data attributes). */
  backgroundColor(): string {
    const el = this.row();
    if (el.dataset.highlight === "true") return "animation:backgroundFlash";
    if (el.dataset.hovered === "true") return "var(--chip)";
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
