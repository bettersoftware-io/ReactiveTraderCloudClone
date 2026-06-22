import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

import { exportToCsv } from "./csvExport";

const trade = (over: Partial<Trade> = {}): Trade => ({
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
});

/**
 * exportToCsv writes to a Blob and triggers a download via an anchor element.
 * jsdom does not implement URL.createObjectURL / revokeObjectURL, so we stub
 * them and capture the Blob's text to assert the serialized CSV content.
 */
let captured: string | null;
const RealBlob = globalThis.Blob;

/** A real Blob subclass that records the joined text parts it was built from. */
class RecordingBlob extends RealBlob {
  constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
    super(parts, options);
    captured = (parts ?? []).map((p) => String(p)).join("");
  }
}

beforeEach(() => {
  captured = null;
  vi.stubGlobal("Blob", RecordingBlob);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  // Anchor.click is a no-op in jsdom; ensure it does not throw.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Return `captured` after asserting it is non-null (set by RecordingBlob). */
function capturedContent(): string {
  if (captured === null)
    throw new Error(
      "RecordingBlob was not invoked — exportToCsv did not create a Blob",
    );
  return captured;
}

describe("exportToCsv", () => {
  it("writes a header row with all column labels", () => {
    exportToCsv([trade()]);
    const [header] = capturedContent().split("\n");
    expect(header).toBe(
      "Trade ID,Status,Trade Date,Direction,CCYCCY,Deal CCY,Notional,Rate,Value Date,Trader",
    );
  });

  it("serializes one CSV row per trade with unformatted notional", () => {
    exportToCsv([
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
    exportToCsv([trade({ tradeName: "Smith, John" })]);
    const row = capturedContent().split("\n")[1];
    expect(row).toContain('"Smith, John"');
  });

  it("leaves comma-free cells unquoted", () => {
    exportToCsv([trade({ tradeName: "Alice" })]);
    const row = capturedContent().split("\n")[1];
    expect(row).not.toContain('"Alice"');
    expect(row).toContain("Alice");
  });

  it("revokes the object URL after triggering the download", () => {
    exportToCsv([trade()]);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});
