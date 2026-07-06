import { NewRfqPanel } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import type { NewRfqPanelPage } from "@ui-contract/pages/credit/newRfq/NewRfqPanelPage";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADAPTIVE_BANK_NAME,
  type Dealer,
  Direction,
  type Instrument,
} from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
  vi.useRealTimers();
});

const instruments: readonly Instrument[] = [
  {
    id: 1,
    name: "US Treasury 10Y",
    cusip: "912828ZQ6",
    ticker: "T 1.5 02/34",
    maturity: "2034-02-15",
    interestRate: 1.5,
    benchmark: "10Y",
    refPrice: 98.4,
  },
  {
    id: 2,
    name: "Apple Inc 2030",
    cusip: "037833EK8",
    ticker: "AAPL 2.4 30",
    maturity: "2030-05-11",
    interestRate: 2.4,
    benchmark: "7Y",
    refPrice: 99.8,
  },
];

const dealers: readonly Dealer[] = [
  { id: 1, name: ADAPTIVE_BANK_NAME },
  { id: 2, name: "Citi" },
  { id: 3, name: "JPMorgan" },
];

describe("NewRfqPanel", () => {
  it("renders the static duration derived from CREDIT_RFQ_EXPIRY_SECONDS", () => {
    const panel = ready();
    expect(panel.durationLabel()).toBe("2 Min");
  });

  it("keeps SEND RFQ disabled until an instrument is selected", async () => {
    const panel = ready();
    await panel.setQuantity(5);
    await panel.toggleDealer(2);
    expect(panel.isSendEnabled()).toBe(false);
    await panel.chooseInstrument(2);
    expect(panel.isSendEnabled()).toBe(true);
  });

  it("keeps SEND RFQ disabled until a positive quantity is entered", async () => {
    const panel = ready();
    await panel.chooseInstrument(2);
    await panel.toggleDealer(2);
    expect(panel.isSendEnabled()).toBe(false);
    await panel.setQuantity(5);
    expect(panel.isSendEnabled()).toBe(true);
  });

  it("keeps SEND RFQ disabled until at least one dealer is selected", async () => {
    const panel = ready();
    await panel.chooseInstrument(2);
    await panel.setQuantity(5);
    expect(panel.isSendEnabled()).toBe(false);
    await panel.toggleDealer(2);
    expect(panel.isSendEnabled()).toBe(true);
  });

  it("opens, selects from, and closes the instrument dropdown", async () => {
    const panel = ready();
    expect(panel.isInstrumentDropdownOpen()).toBe(false);
    await panel.toggleInstrumentDropdown();
    expect(panel.isInstrumentDropdownOpen()).toBe(true);
    await panel.chooseInstrument(2);
    expect(panel.isInstrumentDropdownOpen()).toBe(false);
    expect(panel.instrumentLabel()).toContain("AAPL 2.4 30");
  });

  it('the "All Dealers" toggle selects every dealer, then deselects them all', async () => {
    const panel = ready();
    expect(panel.isAllDealersChecked()).toBe(false);
    await panel.toggleAllDealers();
    expect(panel.isAllDealersChecked()).toBe(true);
    expect(panel.isDealerChecked(1)).toBe(true);
    expect(panel.isDealerChecked(2)).toBe(true);
    expect(panel.isDealerChecked(3)).toBe(true);

    await panel.toggleAllDealers();
    expect(panel.isAllDealersChecked()).toBe(false);
    expect(panel.isDealerChecked(1)).toBe(false);
    expect(panel.isDealerChecked(2)).toBe(false);
    expect(panel.isDealerChecked(3)).toBe(false);
  });

  it("the All Dealers toggle flips to checked once every individual dealer is picked by hand", async () => {
    const panel = ready();
    await panel.toggleDealer(1);
    await panel.toggleDealer(2);
    expect(panel.isAllDealersChecked()).toBe(false);
    await panel.toggleDealer(3);
    expect(panel.isAllDealersChecked()).toBe(true);
  });

  it("marks the Adaptive Bank row as the house dealer", () => {
    const panel = ready();
    expect(panel.isHouseDealer(1)).toBe(true);
    expect(panel.isHouseDealer(2)).toBe(false);
  });

  it("submits the entered RFQ details to the submission machine", async () => {
    const panel = ready();
    await panel.chooseInstrument(2);
    await panel.setQuantity(5);
    await panel.chooseDirection(Direction.Sell);
    await panel.toggleDealer(1);
    await panel.toggleDealer(3);
    await panel.send();
    expect(panel.submittedRfq()).toMatchObject({
      instrumentId: 2,
      dealerIds: [1, 3],
      quantity: 5,
      direction: Direction.Sell,
      expirySecs: 120,
    });
  });

  it("confirms creation to the user once the machine reaches confirmed", async () => {
    const panel = ready();
    await panel.chooseInstrument(2);
    await panel.setQuantity(5);
    await panel.toggleDealer(2);
    await panel.send();
    expect(panel.isConfirmed()).toBe(true);
  });

  it("returns to an empty editing state after the confirmation interval, and a second submission round-trips", async () => {
    // Real timers throughout: racing the fake's setTimeout(REDIRECT_DELAY_MS)
    // against userEvent's own internal real-timer waits (see wait.js in
    // @testing-library/user-event) under vi.useFakeTimers() deadlocks, so
    // this spec drives the actual 1500ms redirect delay in real time
    // instead — the marble-precise timing is already pinned by the
    // client-core unit test (RfqSubmissionMachine.test.ts).
    const panel = ready();

    await panel.chooseInstrument(2);
    await panel.setQuantity(5);
    await panel.chooseDirection(Direction.Sell);
    await panel.toggleDealer(2);
    await panel.send();
    expect(panel.isConfirmed()).toBe(true);

    // REDIRECT_DELAY_MS (1500ms) — the same delay the real
    // RfqsPresenter.createSubmission timer uses before returning to editing.
    await new Promise((resolve) => {
      setTimeout(resolve, 1600);
    });

    expect(panel.isConfirmed()).toBe(false);
    expect(panel.instrumentLabel()).toContain("Select instrument");
    expect(panel.isDirectionActive(Direction.Buy)).toBe(true);
    expect(panel.isDealerChecked(2)).toBe(false);
    expect(panel.isSendEnabled()).toBe(false);

    // A second RFQ can be drafted and submitted from the cleared form.
    await panel.chooseInstrument(1);
    await panel.setQuantity(3);
    await panel.toggleDealer(3);
    await panel.send();
    expect(panel.isConfirmed()).toBe(true);
    expect(panel.submittedRfqs()).toHaveLength(2);
    expect(panel.submittedRfqs()[1]).toMatchObject({
      instrumentId: 1,
      dealerIds: [3],
      quantity: 3,
      direction: Direction.Buy,
    });
  }, 10_000);

  it("resets every field via CLEAR", async () => {
    const panel = ready();
    await panel.chooseInstrument(2);
    await panel.setQuantity(5);
    await panel.chooseDirection(Direction.Sell);
    await panel.toggleDealer(2);

    await panel.clear();

    expect(panel.instrumentLabel()).toContain("Select instrument");
    expect(panel.isDirectionActive(Direction.Buy)).toBe(true);
    expect(panel.isDirectionActive(Direction.Sell)).toBe(false);
    expect(panel.isDealerChecked(2)).toBe(false);
    expect(panel.isSendEnabled()).toBe(false);
  });

  it("defaults to You Buy and lets the user switch to You Sell", async () => {
    const panel = ready();
    expect(panel.isDirectionActive(Direction.Buy)).toBe(true);
    expect(panel.isDirectionActive(Direction.Sell)).toBe(false);
    await panel.chooseDirection(Direction.Sell);
    expect(panel.isDirectionActive(Direction.Sell)).toBe(true);
    expect(panel.isDirectionActive(Direction.Buy)).toBe(false);
  });
});

function ready(): NewRfqPanelPage {
  return mount(NewRfqPanel, {
    props: { onCreated: () => {} },
    hooks: { useInstruments: instruments, useDealers: dealers },
    commands: { createRfq: 555 },
  });
}
