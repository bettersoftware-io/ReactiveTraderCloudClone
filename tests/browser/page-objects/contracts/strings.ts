/**
 * Single source of truth for human-visible text strings used as selectors.
 * PO implementations import from here so a UI copy change requires only a
 * single update.
 */
export const STRINGS = {
  creditRfq: {
    noRfqsMessage: "No RFQs to show",
  },
} as const;
