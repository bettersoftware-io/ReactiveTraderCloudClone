import { within, fireEvent } from "@testing-library/dom";
import type { Trade } from "@rtc/domain";
import { MountedComponent } from "../../../harness/component";

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
    return [...this.row().querySelectorAll("td")].map((td) => td.textContent?.trim() ?? "");
  }

  /** True when a cell with the given text is present. */
  hasCell(text: string): boolean {
    return within(this.row()).queryByText(text) !== null;
  }

  /** True when the row renders with the rejected (struck-through) styling. */
  isRejected(): boolean {
    return this.row().style.textDecoration === "line-through";
  }

  /** The row's current inline background colour (proxy for the new-trade highlight). */
  backgroundColor(): string {
    return this.row().style.backgroundColor;
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
