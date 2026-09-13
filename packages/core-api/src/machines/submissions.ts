import type { CreateRfqInput } from "@rtc/domain";

/** The create→confirmation→redirect lifecycle of NewRfqForm, relocated out of
 * the component's `await createRfq(...)` + `setTimeout` orchestration. The form
 * reads this state; draft input state stays in the component. */
export type RfqSubmissionState =
  | { status: "editing" }
  | { status: "submitting" }
  | { status: "confirmed"; rfqId: number };

export interface RfqSubmissionIntents {
  /** Submit the drafted RFQ; on success confirm, then fire onRedirect(rfqId)
   * after REDIRECT_DELAY_MS. */
  submit: (input: CreateRfqInput, onRedirect: (rfqId: number) => void) => void;
}

/** The submit-price / pass lifecycle of TradeTicket, relocated out of the
 * component's `await quoteRfq(...)` / `await passQuote(...)` + `submitted`
 * useState. The price draft + parseFloat guard stay in the component. */
export interface TicketSubmissionState {
  submitted: boolean;
}

export interface TicketSubmissionIntents {
  submitPrice: (quoteId: number, price: number) => void;
  pass: (quoteId: number) => void;
}
