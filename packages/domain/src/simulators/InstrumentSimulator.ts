import { type Observable, of } from "rxjs";

import type { Instrument } from "../credit/instrument.js";
import type { InstrumentPort } from "../ports/instrumentPort.js";

export const INSTRUMENTS_CATALOG: readonly Instrument[] = [
  {
    id: 0,
    name: "AAPL 2.4 08/30",
    cusip: "037833DX5",
    ticker: "AAPL",
    maturity: "20300815",
    interestRate: 2.4,
    benchmark: "10Y UST 4.000 08/2030",
    refPrice: 98.4,
  },
  {
    id: 1,
    name: "MSFT 3.3 02/27",
    cusip: "594918BV5",
    ticker: "MSFT",
    maturity: "20270215",
    interestRate: 3.3,
    benchmark: "3Y UST 3.500 02/2027",
    refPrice: 99.8,
  },
  {
    id: 2,
    name: "AMZN 4.05 08/47",
    cusip: "023135BW5",
    ticker: "AMZN",
    maturity: "20470815",
    interestRate: 4.05,
    benchmark: "30Y UST 4.250 08/2047",
    refPrice: 96.2,
  },
  {
    id: 3,
    name: "GOOGL 1.1 08/30",
    cusip: "02079KAC1",
    ticker: "GOOGL",
    maturity: "20300815",
    interestRate: 1.1,
    benchmark: "10Y UST 4.000 08/2030",
    refPrice: 91.5,
  },
  {
    id: 4,
    name: "TSLA 5.3 08/25",
    cusip: "88160RAG6",
    ticker: "TSLA",
    maturity: "20250815",
    interestRate: 5.3,
    benchmark: "1Y UST 4.750 08/2025",
    refPrice: 100.6,
  },
  {
    id: 5,
    name: "UST 4.0 11/34",
    cusip: "91282CFP1",
    ticker: "UST",
    maturity: "20341115",
    interestRate: 4.0,
    benchmark: "10Y UST 4.000 11/2034",
    refPrice: 98.9,
  },
  {
    id: 6,
    name: "VZ 4.5 08/33",
    cusip: "92343VGE9",
    ticker: "VZ",
    maturity: "20330815",
    interestRate: 4.5,
    benchmark: "10Y UST 4.125 08/2033",
    refPrice: 97.3,
  },
  {
    id: 7,
    name: "KO 1.45 06/27",
    cusip: "191216DA5",
    ticker: "KO",
    maturity: "20270615",
    interestRate: 1.45,
    benchmark: "3Y UST 3.500 06/2027",
    refPrice: 93.7,
  },
];

export class InstrumentSimulator implements InstrumentPort {
  getInstruments(): Observable<readonly Instrument[]> {
    return of(INSTRUMENTS_CATALOG);
  }
}
