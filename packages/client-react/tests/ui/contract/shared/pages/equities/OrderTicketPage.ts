import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { EquityOrder, OrderStatus } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** Props the OrderTicket component reads (the instrument it trades). */
export interface OrderTicketProps {
  symbol: string;
}

/** The shape a spec pushes to advance the place lifecycle one step. */
export interface LifecyclePatch {
  status: OrderStatus;
  filledQty: number;
  qty?: number;
  avgPrice?: number;
}

/**
 * Page object for the equity OrderTicket. The ticket is dumb: it reads its
 * state from `useOrderTicket(symbol)` (the REAL OrderTicketMachine, backed by a
 * World `place()` that returns the lifecycle Subject) and renders the current
 * `phase` into `data-phase`. A spec drives the form through the rendered inputs
 * (setQty/submit) to reach `submitting`, then {@link pushLifecycle} emits the
 * working/partiallyFilled/filled orders that walk the phase forward.
 */
export class OrderTicketPage extends MountedComponent<OrderTicketProps> {
  private readonly user: UserEvent = userEvent.setup();

  private container(): HTMLElement {
    return within(this.root).getByTestId("order-ticket");
  }

  /** The current lifecycle phase, read from `data-phase`. */
  phase(): string {
    return this.container().getAttribute("data-phase") ?? "";
  }

  /** The editing-form validation error, or null when none is shown. */
  error(): string | null {
    const el = within(this.root).queryByText(
      /quantity must be greater than zero|limit price required/i,
    );
    return el?.textContent?.trim() ?? null;
  }

  /** The Submit button's label (e.g. "BUY AAPL" / "SELL AAPL"). */
  submitLabel(): string {
    return (
      within(this.root)
        .getByTestId("order-ticket-submit")
        .textContent?.trim() ?? ""
    );
  }

  /** True when the conditional limit-price field is shown (limit order). */
  hasLimitField(): boolean {
    return within(this.root).queryByText(/limit price/i) !== null;
  }

  /** Click a side toggle (Buy / Sell). */
  async setSide(side: "buy" | "sell"): Promise<void> {
    const button = this.container().querySelector(`[data-side="${side}"]`);
    if (!button) throw new Error(`No side toggle for ${side}`);
    await this.user.click(button as HTMLElement);
  }

  /** Click a type toggle (Market / Limit). */
  async setType(type: "market" | "limit"): Promise<void> {
    await this.user.click(
      within(this.root).getByRole("button", {
        name: type === "market" ? /^market$/i : /^limit$/i,
      }),
    );
  }

  /** Type a quantity into the editing-form's number input. */
  async setQty(qty: number): Promise<void> {
    const input = within(this.root).getAllByRole(
      "spinbutton",
    )[0] as HTMLInputElement;
    await this.user.clear(input);
    if (qty !== 0) await this.user.type(input, String(qty));
  }

  /** Type a limit price into the conditional limit-price input. */
  async setLimitPrice(price: number): Promise<void> {
    const inputs = within(this.root).getAllByRole(
      "spinbutton",
    ) as HTMLInputElement[];
    const limitInput = inputs[1];
    if (!limitInput)
      throw new Error("No limit-price input (not a limit order)");
    await this.user.clear(limitInput);
    await this.user.type(limitInput, String(price));
  }

  /** Click the reset/new-order control shown in a terminal phase. */
  async reset(): Promise<void> {
    await this.user.click(
      within(this.root).getByRole("button", {
        name: /reset|new order|retry/i,
      }),
    );
  }

  /** Click Submit (a discrete event → React flushes the phase transition). */
  async submit(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("order-ticket-submit"));
  }

  /** Advance the place lifecycle by emitting one order (status + filledQty). */
  pushLifecycle(patch: LifecyclePatch): void {
    const order: EquityOrder = {
      id: "test-order",
      symbol: "TEST",
      side: "buy",
      type: "market",
      qty: patch.qty ?? 100,
      status: patch.status,
      filledQty: patch.filledQty,
      avgPrice: patch.avgPrice,
      createdAt: 0,
    };
    this.pushOrderLifecycle(order);
  }
}
