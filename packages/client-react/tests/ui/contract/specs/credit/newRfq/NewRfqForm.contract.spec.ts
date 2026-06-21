import {
  ADAPTIVE_BANK_NAME,
  type Dealer,
  Direction,
  type Instrument,
} from "@rtc/domain";
import { NewRfqForm } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it, vi } from "vitest";

const instruments: readonly Instrument[] = [
  {
    id: 1,
    name: "US Treasury 10Y",
    cusip: "912828ZQ6",
    ticker: "T 1.5 02/34",
    maturity: "2034-02-15",
    interestRate: 1.5,
    benchmark: "10Y",
  },
  {
    id: 2,
    name: "Apple Inc 2030",
    cusip: "037833EK8",
    ticker: "AAPL 2.4 30",
    maturity: "2030-05-11",
    interestRate: 2.4,
    benchmark: "7Y",
  },
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

  it("shows a disabled in-flight state while the create-RFQ command is pending", async () => {
    // Omit the createRfq result so the submission stays in flight (the real
    // machine emits "submitting" synchronously, then "confirmed" only after the
    // async RPC resolves). This exposes the transient in-flight render.
    const form = mount(NewRfqForm, {
      props: { onCreated: () => {} },
      hooks: { useInstruments: instruments, useDealers: dealers },
    });
    await form.chooseInstrument("Apple Inc 2030");
    await form.setQuantity(5);
    await form.submit();
    expect(form.isSubmitting()).toBe(true);
    expect(form.isSubmittingDisabled()).toBe(true);
  });

  it("blocks submission when the quantity exceeds the maximum", async () => {
    const form = ready();
    await form.chooseInstrument("Apple Inc 2030");
    await form.setQuantity(200_000_000);
    expect(form.hasQuantityError()).toBe(true);
    expect(form.isSubmitDisabled()).toBe(true);
  });

  it("lets the user clear a chosen instrument and search again", async () => {
    const form = ready();
    await form.chooseInstrument("Apple Inc 2030");
    expect(form.hasSelectedInstrument()).toBe(true);
    await form.clearInstrument();
    expect(form.hasSelectedInstrument()).toBe(false);
    // After clearing, the submit button is disabled again (no instrument).
    expect(form.isSubmitDisabled()).toBe(true);
  });

  it("pre-selects every dealer and lets the user toggle them off and on", async () => {
    const form = ready();
    expect(form.dealerNames()).toEqual([ADAPTIVE_BANK_NAME, "Citi"]);
    expect(form.isDealerSelected("Citi")).toBe(true);
    await form.toggleDealer("Citi");
    expect(form.isDealerSelected("Citi")).toBe(false);
    await form.toggleDealer("Citi");
    expect(form.isDealerSelected("Citi")).toBe(true);
  });

  it("notifies the parent with the created RFQ id", async () => {
    // shouldAdvanceTime keeps real time ticking the fake clock so userEvent's
    // and findBy's internal polling still resolves; we retain manual control of
    // the component's 1.5s onCreated setTimeout via advanceTimersByTimeAsync.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onCreated = vi.fn();
      const form = mount(NewRfqForm, {
        props: { onCreated },
        hooks: { useInstruments: instruments, useDealers: dealers },
        commands: { createRfq: 555 },
      });
      // userEvent waits on real timers by default; route its delays through the
      // installed fake clock so interactions still resolve under fake timers.
      form.useFakeTimerAdvance(vi.advanceTimersByTime);
      await form.chooseInstrument("Apple Inc 2030");
      await form.setQuantity(5);
      await form.submit();
      // The component fires onCreated on a 1.5s setTimeout after createRfq resolves.
      await vi.advanceTimersByTimeAsync(1500);
      expect(onCreated).toHaveBeenCalledWith(555);
    } finally {
      vi.useRealTimers();
    }
  });
});
