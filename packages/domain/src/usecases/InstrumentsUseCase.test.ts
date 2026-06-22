import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";

import type { Instrument } from "../credit/instrument.js";
import type { InstrumentPort } from "../ports/instrumentPort.js";
import { InstrumentsUseCase } from "./InstrumentsUseCase.js";

describe("InstrumentsUseCase", () => {
  it("delegates to InstrumentPort.getInstruments", async () => {
    const instruments: readonly Instrument[] = [];
    const port: InstrumentPort = {
      getInstruments: () => {
        return of(instruments);
      },
    };
    const useCase = new InstrumentsUseCase(port);
    expect(await firstValueFrom(useCase.execute())).toBe(instruments);
  });
});
