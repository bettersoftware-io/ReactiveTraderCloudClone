import { describe, it, expect } from "vitest";
import { Direction, type Instrument, type Dealer, ADAPTIVE_BANK_NAME } from "@rtc/domain";
import { mount } from "@behaviour/mount";
import { NewRfqForm } from "@behaviour/components";

const instruments: readonly Instrument[] = [
  { id: 1, name: "US Treasury 10Y", cusip: "912828ZQ6", ticker: "T 1.5 02/34", maturity: "2034-02-15", interestRate: 1.5, benchmark: "10Y" },
  { id: 2, name: "Apple Inc 2030", cusip: "037833EK8", ticker: "AAPL 2.4 30", maturity: "2030-05-11", interestRate: 2.4, benchmark: "7Y" },
];
const dealers: readonly Dealer[] = [
  { id: 1, name: ADAPTIVE_BANK_NAME },
  { id: 2, name: "Citi" },
];

const ready = () =>
  mount(NewRfqForm, {
    props: { onCreated: () => {} },
    hooks: { useInstruments: instruments, useDealers: dealers },
    commands: { createRfq: 555 },
  });

describe("NewRfqForm", () => {
  it("keeps submit disabled until an instrument and quantity are provided", async () => {
    const form = ready();
    expect(form.isSubmitDisabled()).toBe(true);
    await form.chooseInstrument("Apple Inc 2030");
    await form.setQuantity(5);
    expect(form.isSubmitDisabled()).toBe(false);
  });

  it("submits the entered RFQ details to the create-RFQ command", async () => {
    const form = ready();
    await form.chooseInstrument("Apple Inc 2030");
    await form.setQuantity(5);
    await form.setDirection(Direction.Sell);
    await form.submit();
    expect(form.createdRfq()).toMatchObject({
      instrumentId: 2,
      quantity: 5,
      direction: Direction.Sell,
    });
  });

  it("confirms creation to the user", async () => {
    const form = ready();
    await form.chooseInstrument("Apple Inc 2030");
    await form.setQuantity(5);
    await form.submit();
    await form.shouldShowConfirmation();
  });

  it("blocks submission when the quantity exceeds the maximum", async () => {
    const form = ready();
    await form.chooseInstrument("Apple Inc 2030");
    await form.setQuantity(200_000_000);
    expect(form.hasQuantityError()).toBe(true);
    expect(form.isSubmitDisabled()).toBe(true);
  });
});
