import { expect, test } from "vitest";

import { Direction, type Rfq, RfqState } from "@rtc/domain";

import { filterRfqs, RFQ_FILTERS } from "#/ui/credit/rfqTiles/rfqTileFilter";

test("RFQ_FILTERS lists the three shared tabs in order", () => {
  expect(RFQ_FILTERS).toEqual(["live", "closed", "all"]);
});

test("live keeps Open RFQs", () => {
  const rfqs = [rfq(1, RfqState.Open, 1), rfq(3, RfqState.Expired, 3)];
  expect(ids(filterRfqs(rfqs, "live", new Set()))).toEqual([1]);
});

// THE ACCEPT LINGER, and the only place it can be asserted. Encoding it as an
// exit-animation duration cannot work — the exiting element is the pre-accept
// snapshot — so the linger lives here, as a filter property, with no timer and
// nothing for jest to be blind to.
test("live KEEPS a traded rfq so its ACCEPTED stamp can be read", () => {
  const rfqs = [rfq(1, RfqState.Open, 1), rfq(2, RfqState.Closed, 2)];
  expect([...ids(filterRfqs(rfqs, "live", new Set()))].sort()).toEqual([1, 2]);
});

test("live drops a traded rfq once it is dismissed", () => {
  const rfqs = [rfq(1, RfqState.Open, 1), rfq(2, RfqState.Closed, 2)];
  expect(ids(filterRfqs(rfqs, "live", new Set([2])))).toEqual([1]);
});

// Only a TRADE earns the acknowledgement. An expired or cancelled rfq has
// nothing to stamp, so it leaves immediately.
test("live drops expired and cancelled rfqs immediately", () => {
  const rfqs = [
    rfq(1, RfqState.Open, 1),
    rfq(3, RfqState.Expired, 3),
    rfq(4, RfqState.Cancelled, 4),
  ];
  expect(ids(filterRfqs(rfqs, "live", new Set()))).toEqual([1]);
});

// The prototype's DONE tab is `state !== 'live'` (dc.html:2129), and the web
// client's `closed` matches. Expired and Cancelled belong here — they are no
// longer tabs of their own.
test("closed keeps everything that is no longer open", () => {
  const rfqs = [
    rfq(1, RfqState.Open, 1),
    rfq(2, RfqState.Closed, 2),
    rfq(3, RfqState.Expired, 3),
    rfq(4, RfqState.Cancelled, 4),
  ];
  expect([...ids(filterRfqs(rfqs, "closed", new Set()))].sort()).toEqual([
    2, 3, 4,
  ]);
});

test("all keeps every non-dismissed RFQ, newest first", () => {
  const rfqs = [
    rfq(1, RfqState.Open, 1),
    rfq(2, RfqState.Closed, 3),
    rfq(3, RfqState.Expired, 2),
  ];
  expect(ids(filterRfqs(rfqs, "all", new Set()))).toEqual([2, 3, 1]);
});

test("dismissed ids are excluded", () => {
  const rfqs = [rfq(1, RfqState.Open, 1), rfq(2, RfqState.Open, 2)];
  expect(ids(filterRfqs(rfqs, "all", new Set([1])))).toEqual([2]);
});

test("does not mutate the input array", () => {
  const rfqs = [rfq(1, RfqState.Open, 1), rfq(2, RfqState.Open, 2)];
  filterRfqs(rfqs, "all", new Set());
  expect(ids(rfqs)).toEqual([1, 2]);
});

function ids(rfqs: readonly Rfq[]): readonly number[] {
  return rfqs.map((r) => {
    return r.id;
  });
}

function rfq(id: number, state: RfqState, ts: number): Rfq {
  return {
    id,
    instrumentId: 1,
    quantity: 10,
    direction: Direction.Buy,
    state,
    expirySecs: 120,
    creationTimestamp: ts,
  };
}
