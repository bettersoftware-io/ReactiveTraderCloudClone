import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { Instrument, InstrumentPort } from "@rtc/domain";
import { InstrumentsPresenter } from "../InstrumentsPresenter";

describe("InstrumentsPresenter", () => {
  it("exposes instruments", async () => {
    const instruments: readonly Instrument[] = [];
    const port: InstrumentPort = { getInstruments: () => of(instruments) };
    expect(await firstValueFrom(new InstrumentsPresenter(port).list$)).toBe(instruments);
  });
});
