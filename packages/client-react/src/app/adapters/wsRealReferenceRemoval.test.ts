import { describe, expect, it } from "vitest";

import type { Dealer, Instrument } from "@rtc/domain";
import {
  dealerAdded,
  dealerEndOfSoW,
  dealerRemoved,
  dealerStartOfSoW,
  instrumentAdded,
  instrumentEndOfSoW,
  instrumentRemoved,
  instrumentStartOfSoW,
} from "@rtc/shared/__fixtures__/wireFrames";

import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { createWsRealPorts } from "./portFactory";

/**
 * The reference-data ports keep an internal roster and re-emit the full list
 * on each post-SoW event. A "removed" event must drop the matching entry from
 * subsequent emissions (the findIndex/splice arm). Driven black-box: subscribe,
 * play SoW + adds, then a remove, and assert the latest emitted list no longer
 * contains the removed id.
 */
describe("wsReal reference data :: removed event drops the entry", () => {
  it("instruments: a removed instrument disappears from the next emitted list", () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const emissions: (readonly Instrument[])[] = [];
    const sub = ports.instruments
      .getInstruments()
      .subscribe((list) => emissions.push(list));

    ws.emit("stream.instrumentEvent", instrumentStartOfSoW());
    ws.emit("stream.instrumentEvent", instrumentAdded({ id: 100 }));
    ws.emit("stream.instrumentEvent", instrumentAdded({ id: 101 }));
    ws.emit("stream.instrumentEvent", instrumentEndOfSoW());
    expect(
      emissions
        .at(-1)
        ?.map((i) => i.id)
        .sort(),
    ).toEqual([100, 101]);

    ws.emit("stream.instrumentEvent", instrumentRemoved(100));

    expect(emissions.at(-1)?.map((i) => i.id)).toEqual([101]);
    sub.unsubscribe();
    ws.dispose();
  });

  it("instruments: removing an unknown id leaves the list unchanged but still re-emits", () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const emissions: (readonly Instrument[])[] = [];
    const sub = ports.instruments
      .getInstruments()
      .subscribe((list) => emissions.push(list));

    ws.emit("stream.instrumentEvent", instrumentStartOfSoW());
    ws.emit("stream.instrumentEvent", instrumentAdded({ id: 100 }));
    ws.emit("stream.instrumentEvent", instrumentEndOfSoW());

    ws.emit("stream.instrumentEvent", instrumentRemoved(999));

    expect(emissions.at(-1)?.map((i) => i.id)).toEqual([100]);
    sub.unsubscribe();
    ws.dispose();
  });

  it("dealers: a removed dealer disappears from the next emitted list", () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const emissions: (readonly Dealer[])[] = [];
    const sub = ports.dealers
      .getDealers()
      .subscribe((list) => emissions.push(list));

    ws.emit("stream.dealerEvent", dealerStartOfSoW());
    ws.emit("stream.dealerEvent", dealerAdded({ id: 100 }));
    ws.emit("stream.dealerEvent", dealerAdded({ id: 101 }));
    ws.emit("stream.dealerEvent", dealerEndOfSoW());
    expect(
      emissions
        .at(-1)
        ?.map((d) => d.id)
        .sort(),
    ).toEqual([100, 101]);

    ws.emit("stream.dealerEvent", dealerRemoved(101));

    expect(emissions.at(-1)?.map((d) => d.id)).toEqual([100]);
    sub.unsubscribe();
    ws.dispose();
  });
});
