/**
 * Single source of truth for human-visible text strings used as selectors.
 * Both Playwright and Cypress PO implementations import from here so a
 * UI copy change requires only a single update.
 */
export const STRINGS = {
  creditRfq: {
    noRfqsMessage: "No RFQs to show",
  },
  devtools: {
    /** Accessible name of the inspector's Machines tab button. */
    machinesTab: "Machines",
  },
} as const;
