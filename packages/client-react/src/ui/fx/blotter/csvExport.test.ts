import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

import { COLUMNS, formatFxCell } from "./blotterColumns";
import { exportFxToCsv, exportToCsv } from "./csvExport";

/**
 * exportToCsv writes to a Blob and triggers a download via an anchor element.
 * jsdom does not implement URL.createObjectURL / revokeObjectURL, so we stub
 * them and capture the Blob's text to assert the serialized CSV content.
 */
let captured: string | null;
let downloadName: string | null;
const RealBlob: typeof Blob = globalThis.Blob;

/** A real Blob subclass that records the joined text parts it was built from. */
// eslint-disable-next-line rtc/class-filename-match -- small local Blob test double; file is named after the system under test
class RecordingBlob extends RealBlob {
  constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
    super(parts, options);
    captured = (parts ?? [])
      .map((p) => {
        return String(p);
      })
      .join("");
  }
}

beforeEach(() => {
  captured = null;
  downloadName = null;
  vi.stubGlobal("Blob", RecordingBlob);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  // Anchor.click is a no-op in jsdom; capture the anchor's download name so
  // each caller's suggested filename can be asserted.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadName = this.download;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("exportToCsv", () => {
  it("writes a header row with all column labels", () => {
    exportFxToCsv([trade()]);
    const [header] = capturedContent().split("\n");
    expect(header).toBe(
      "Trade ID,Status,Trade Date,Direction,CCYCCY,Deal CCY,Notional,Rate,Value Date,Trader",
    );
  });

  it("serializes one CSV row per trade with unformatted notional", () => {
    exportFxToCsv([
      trade({ tradeId: 11, notional: 2_500_000, tradeName: "Bob" }),
      trade({ tradeId: 12, notional: 7_000_000, tradeName: "Carol" }),
    ]);
    const lines = capturedContent().split("\n");
    expect(lines).toHaveLength(3); // header + 2 rows
    // Notional is the raw integer (no thousands separators) in the CSV.
    expect(lines[1]).toContain("2500000");
    expect(lines[2]).toContain("7000000");
    expect(lines[1]).toContain("Bob");
    expect(lines[2]).toContain("Carol");
  });

  it("quotes cells that contain a comma", () => {
    // A trader name with a comma must be wrapped in double quotes.
    exportFxToCsv([trade({ tradeName: "Smith, John" })]);
    const row = capturedContent().split("\n")[1];
    expect(row).toContain('"Smith, John"');
  });

  it("leaves comma-free cells unquoted", () => {
    exportFxToCsv([trade({ tradeName: "Alice" })]);
    const row = capturedContent().split("\n")[1];
    expect(row).not.toContain('"Alice"');
    expect(row).toContain("Alice");
  });

  it("revokes the object URL after triggering the download", () => {
    exportFxToCsv([trade()]);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  // Per-blotter filenames (PROTO useFxBlotter.ts / useCreditRfqs.ts) — the
  // FX convenience pins its own, and the generic export downloads under
  // whatever name its caller passes (CreditBlotter passes credit-trades.csv).
  it("downloads the FX export as fx-trades.csv", () => {
    exportFxToCsv([trade()]);
    expect(downloadName).toBe("fx-trades.csv");
  });

  it("downloads the generic export under the caller's filename", () => {
    exportToCsv([trade()], COLUMNS, formatFxCell, "credit-trades.csv");
    expect(downloadName).toBe("credit-trades.csv");
  });
});

function trade(over: Partial<Trade> = {}): Trade {
  return {
    tradeId: 1,
    tradeName: "Alice",
    currencyPair: "EURUSD",
    notional: 1_000_000,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.09221,
    status: TradeStatus.Done,
    tradeDate: "2026-01-01",
    valueDate: "2026-01-03",
    ...over,
  };
}

/** Return `captured` after asserting it is non-null (set by RecordingBlob). */
function capturedContent(): string {
  if (captured === null)
    throw new Error(
      "RecordingBlob was not invoked — exportToCsv did not create a Blob",
    );
  return captured;
}
