export type QuoteState =
  | { readonly type: "pendingWithoutPrice" }
  | { readonly type: "pendingWithPrice"; readonly price: number }
  | { readonly type: "passed" }
  | { readonly type: "accepted"; readonly price: number }
  | { readonly type: "rejectedWithPrice"; readonly price: number }
  | { readonly type: "rejectedWithoutPrice" };

export interface Quote {
  readonly id: number;
  readonly rfqId: number;
  readonly dealerId: number;
  readonly state: QuoteState;
}

/**
 * Returns the set of valid next state types for a given quote state.
 */
export function validQuoteTransitions(current: QuoteState["type"]): readonly QuoteState["type"][] {
  switch (current) {
    case "pendingWithoutPrice":
      return ["pendingWithPrice", "passed", "rejectedWithoutPrice"];
    case "pendingWithPrice":
      return ["accepted", "rejectedWithPrice"];
    case "passed":
      return ["passed"]; // terminal
    case "accepted":
      return []; // terminal
    case "rejectedWithPrice":
      return []; // terminal
    case "rejectedWithoutPrice":
      return []; // terminal
  }
}
