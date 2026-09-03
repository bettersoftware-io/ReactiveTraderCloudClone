import { afterEach, expect, jest, test } from "@jest/globals";

import { type Dealer, Direction, RFQ_DEFAULT_EXPIRY_SECS } from "@rtc/domain";

import { RFQ_QUANTITY_CHIPS } from "#/ui/credit/newRfq/rfqQuantities";
import {
  type NewRfqSubmitFn,
  newRfqFormPage,
} from "#tests/pages/NewRfqFormPage";

const DEALERS: readonly Dealer[] = [
  { id: 1, name: "Bank A" },
  { id: 2, name: "Bank B" },
];

const page = newRfqFormPage();

afterEach(() => {
  return page.unmountAll();
});

test("broadcast is inert until an instrument and a quantity chip are chosen", async () => {
  const submit = jest.fn<NewRfqSubmitFn>();
  await page.mountEditing(submit, DEALERS);

  // No instrument / no quantity yet.
  await page.press("rfq-submit");
  expect(submit).not.toHaveBeenCalled();

  await page.press("instrument-chip-1");
  await page.press("rfq-submit");
  expect(submit).not.toHaveBeenCalled();

  await page.press(`quantity-chip-${RFQ_QUANTITY_CHIPS[2]}`);
  await page.press("rfq-submit");

  expect(submit).toHaveBeenCalledTimes(1);
  const [input] = submit.mock.calls[0];
  expect(input).toEqual({
    instrumentId: 1,
    dealerIds: DEALERS.map((d) => {
      return d.id;
    }),
    // UI-SCALE, not notional: `CreateRfqUseCase` multiplies by
    // CREDIT_QUANTITY_MULTIPLIER on the way to the port. Asserting the literal
    // notional here is what let a 1000x error reach a device.
    quantity: RFQ_QUANTITY_CHIPS[2],
    direction: Direction.Buy,
  });
});

// The dealer picker is gone (Phase 5 design §5a) — every RFQ streams to the
// whole panel. This is the assertion that would catch an empty `dealerIds`
// slipping through, which the seam would reject.
test("broadcasts to every dealer with no picker in the form", async () => {
  const submit = jest.fn<NewRfqSubmitFn>();
  await page.mountEditing(submit, DEALERS);

  await page.press("instrument-chip-1");
  await page.press(`quantity-chip-${RFQ_QUANTITY_CHIPS[0]}`);
  await page.press("rfq-submit");

  expect(submit.mock.calls[0][0].dealerIds).toEqual(
    DEALERS.map((d) => {
      return d.id;
    }),
  );
  // Both numbers are DERIVED, not copy: the count from `DEALERS` (the roster
  // this spec seeded `useDealers()` with above) and the window from the use
  // case's own default (the form omits `expirySecs`, so
  // `RFQ_DEFAULT_EXPIRY_SECS` is literally the lifetime these RFQs get). The
  // footnote read a hardcoded "45S" until the mobile-v1 fidelity pass, which
  // is the prototype's number and not this app's.
  expect(
    page.hasText(
      `STREAMS TO ${DEALERS.length} DEALERS · ${RFQ_DEFAULT_EXPIRY_SECS}S WINDOW`,
    ),
  ).toBe(true);
});

// The design gives each side its OWN colour rather than one shared brand
// fill, so "which side is active" is carried by more than a border — these
// assert the selected flag both ways round, which is what a screen reader
// (and the visual golden's chip state) actually reads.
test("the chosen direction is the only one flagged selected", async () => {
  const submit = jest.fn<NewRfqSubmitFn>();
  await page.mountEditing(submit, DEALERS);

  expect(
    page.accessibilityStateOf(`rfq-direction-${Direction.Buy}`),
  ).toMatchObject({
    selected: true,
  });
  expect(
    page.accessibilityStateOf(`rfq-direction-${Direction.Sell}`),
  ).toMatchObject({ selected: false });

  await page.press(`rfq-direction-${Direction.Sell}`);

  expect(
    page.accessibilityStateOf(`rfq-direction-${Direction.Buy}`),
  ).toMatchObject({
    selected: false,
  });
  expect(
    page.accessibilityStateOf(`rfq-direction-${Direction.Sell}`),
  ).toMatchObject({ selected: true });
});

// `Direction` is Title Case on the wire ("Buy"/"Sell"); the design prints
// uppercase. The label is cased in the view, so this is the assertion that
// catches the enum leaking through verbatim again.
test("direction buttons print the design's uppercase labels", async () => {
  const submit = jest.fn<NewRfqSubmitFn>();
  await page.mountEditing(submit, DEALERS);

  expect(page.hasText("BUY")).toBe(true);
  expect(page.hasText("SELL")).toBe(true);
});

// The accent→accent2 ramp is the button's FILL, not decoration, and it is
// drawn only on the enabled arm — a glowing gradient under a dead button
// would advertise an action that cannot be taken.
test("the broadcast gradient appears only once the ticket is submittable", async () => {
  const submit = jest.fn<NewRfqSubmitFn>();
  await page.mountEditing(submit, DEALERS);

  expect(page.exists("cta-gradient")).toBe(false);

  await page.press("instrument-chip-1");
  await page.press(`quantity-chip-${RFQ_QUANTITY_CHIPS[0]}`);

  expect(page.exists("cta-gradient")).toBe(true);
});

test("sell direction rides through to the submitted rfq", async () => {
  const submit = jest.fn<NewRfqSubmitFn>();
  await page.mountEditing(submit, DEALERS);

  await page.press("instrument-chip-1");
  await page.press(`quantity-chip-${RFQ_QUANTITY_CHIPS[0]}`);
  await page.press(`rfq-direction-${Direction.Sell}`);
  await page.press("rfq-submit");

  expect(submit.mock.calls[0][0].direction).toBe(Direction.Sell);
});

// The visual harness cannot tap before it screenshots, so the golden's
// pre-chosen ticket has to arrive as a prop. These two assertions pin both
// halves of that seam: the seeded chips read selected, and the seeded values
// are what actually submit (a seed that only painted the chips would be a
// lie the golden could not see).
test("initialSelection preselects the instrument, direction and quantity chips", async () => {
  const submit = jest.fn<NewRfqSubmitFn>();
  await page.mountEditing(submit, DEALERS, {
    instrumentId: 1,
    direction: Direction.Sell,
    quantity: RFQ_QUANTITY_CHIPS[2],
  });

  expect(page.accessibilityStateOf("instrument-chip-1")).toMatchObject({
    selected: true,
  });
  expect(
    page.accessibilityStateOf(`quantity-chip-${RFQ_QUANTITY_CHIPS[2]}`),
  ).toMatchObject({ selected: true });

  await page.press("rfq-submit");

  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit.mock.calls[0][0]).toEqual({
    instrumentId: 1,
    dealerIds: DEALERS.map((d) => {
      return d.id;
    }),
    quantity: RFQ_QUANTITY_CHIPS[2],
    direction: Direction.Sell,
  });
});

// An omitted field must fall back to the form's own default rather than
// blanking the other two — the fields are independent.
test("an omitted initialSelection field keeps the form default", async () => {
  const submit = jest.fn<NewRfqSubmitFn>();
  await page.mountEditing(submit, DEALERS, { instrumentId: 1 });

  expect(page.accessibilityStateOf("instrument-chip-1")).toMatchObject({
    selected: true,
  });
  expect(
    page.accessibilityStateOf(`quantity-chip-${RFQ_QUANTITY_CHIPS[0]}`),
  ).toMatchObject({ selected: false });

  // No quantity yet, so broadcast is still inert.
  await page.press("rfq-submit");
  expect(submit).not.toHaveBeenCalled();

  await page.press(`quantity-chip-${RFQ_QUANTITY_CHIPS[0]}`);
  await page.press("rfq-submit");

  expect(submit.mock.calls[0][0].direction).toBe(Direction.Buy);
});

// The design goes straight from the credit sub-nav to the INSTRUMENT label;
// the sans "New RFQ" title that used to head the form printed the active
// tab's own name a second time. This is the guard against it coming back
// with the next port of a web panel.
test("prints no screen heading above the instrument grid", async () => {
  const submit = jest.fn<NewRfqSubmitFn>();
  await page.mountEditing(submit, DEALERS);

  expect(page.exists("new-rfq-form")).toBe(true);
  expect(page.hasText("New RFQ")).toBe(false);
  expect(page.hasText("INSTRUMENT")).toBe(true);
});

test("renders the confirmed card in the confirmed state", async () => {
  const submit = jest.fn<NewRfqSubmitFn>();
  await page.mountConfirmed(submit, DEALERS, 77);
  expect(page.containsTextContent("rfq-confirmed", "RFQ ID: 77")).toBe(true);
});
