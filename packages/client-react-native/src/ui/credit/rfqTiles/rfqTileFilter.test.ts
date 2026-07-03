import { expect, test } from "vitest";

import { Direction, type Rfq, RfqState } from "@rtc/domain";

import { filterRfqs, RFQ_FILTERS } from "#/ui/credit/rfqTiles/rfqTileFilter";

test("RFQ_FILTERS lists the five tabs in order", () => {
  expect(RFQ_FILTERS).toEqual(["Live", "All", "Done", "Expired", "Cancelled"]);
});

test("Live keeps only Open RFQs", () => {
  const rfqs = [rfq(1, RfqState.Open, 1), rfq(2, RfqState.Closed, 2)];
  expect(
    filterRfqs(rfqs, "Live", new Set()).map((r) => {
      return r.id;
    }),
  ).toEqual([1]);
});

test("All keeps every non-dismissed RFQ, newest first", () => {
  const rfqs = [
    rfq(1, RfqState.Open, 1),
    rfq(2, RfqState.Closed, 3),
    rfq(3, RfqState.Expired, 2),
  ];
  expect(
    filterRfqs(rfqs, "All", new Set()).map((r) => {
      return r.id;
    }),
  ).toEqual([2, 3, 1]);
});

test("dismissed ids are excluded", () => {
  const rfqs = [rfq(1, RfqState.Open, 1), rfq(2, RfqState.Open, 2)];
  expect(
    filterRfqs(rfqs, "All", new Set([1])).map((r) => {
      return r.id;
    }),
  ).toEqual([2]);
});

test("Done/Expired/Cancelled select their state", () => {
  const rfqs = [
    rfq(1, RfqState.Closed, 1),
    rfq(2, RfqState.Expired, 2),
    rfq(3, RfqState.Cancelled, 3),
  ];
  expect(
    filterRfqs(rfqs, "Done", new Set()).map((r) => {
      return r.id;
    }),
  ).toEqual([1]);
  expect(
    filterRfqs(rfqs, "Expired", new Set()).map((r) => {
      return r.id;
    }),
  ).toEqual([2]);
  expect(
    filterRfqs(rfqs, "Cancelled", new Set()).map((r) => {
      return r.id;
    }),
  ).toEqual([3]);
});

test("does not mutate the input array", () => {
  const rfqs = [rfq(1, RfqState.Open, 1), rfq(2, RfqState.Open, 2)];
  filterRfqs(rfqs, "All", new Set());
  expect(
    rfqs.map((r) => {
      return r.id;
    }),
  ).toEqual([1, 2]);
});

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
