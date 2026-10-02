import { of } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { Direction } from "@rtc/domain";

import {
  isBoundedString,
  isCandleHistoryPayload,
  isCandlesPayload,
  isCreateRfqRequestDto,
  isExecutionRequestDto,
  isPlaceOrderRequest,
  isQuoteRequestDto,
  isSymbolPayload,
  isThroughputPayload,
  MalformedPayloadError,
  requireValid,
  type SymbolPayload,
  validated,
} from "#/effects/guards";

describe("guards", () => {
  it("isBoundedString rejects empty, over-long and non-string values", () => {
    expect(isBoundedString("EURUSD", 16)).toBe(true);
    expect(isBoundedString("x".repeat(16), 16)).toBe(true);
    expect(isBoundedString("", 16)).toBe(false);
    expect(isBoundedString("x".repeat(17), 16)).toBe(false);
    expect(isBoundedString(42, 16)).toBe(false);
  });

  it("isSymbolPayload needs a bounded symbol string on a plain record", () => {
    expect(isSymbolPayload({ symbol: "EURUSD" })).toBe(true);
    expect(isSymbolPayload({ symbol: "x".repeat(17) })).toBe(false);
    expect(isSymbolPayload({ symbol: 7 })).toBe(false);
    expect(isSymbolPayload({})).toBe(false);
    expect(isSymbolPayload(["EURUSD"])).toBe(false);
    expect(isSymbolPayload(null)).toBe(false);
    expect(isSymbolPayload(undefined)).toBe(false);
  });

  it("isThroughputPayload needs a finite numeric value", () => {
    expect(isThroughputPayload({ value: 100 })).toBe(true);
    expect(isThroughputPayload({ value: "fast" })).toBe(false);
    expect(isThroughputPayload({ value: Number.NaN })).toBe(false);
    expect(isThroughputPayload({})).toBe(false);
  });

  it("isExecutionRequestDto checks every field and the direction enum", () => {
    expect(isExecutionRequestDto(createExecutionRequest())).toBe(true);
    expect(
      isExecutionRequestDto(createExecutionRequest({ direction: "Long" })),
    ).toBe(false);
    expect(
      isExecutionRequestDto(createExecutionRequest({ notional: Number.NaN })),
    ).toBe(false);
    expect(
      isExecutionRequestDto(createExecutionRequest({ notional: -1 })),
    ).toBe(false);
    expect(isExecutionRequestDto(createExecutionRequest({ notional: 0 }))).toBe(
      false,
    );
    expect(
      isExecutionRequestDto(createExecutionRequest({ currencyPair: "" })),
    ).toBe(false);
    expect(
      isExecutionRequestDto(createExecutionRequest({ spotRate: "1.1" })),
    ).toBe(false);
    expect(
      isExecutionRequestDto(createExecutionRequest({ valueDate: undefined })),
    ).toBe(false);
    expect(
      isExecutionRequestDto(
        createExecutionRequest({ dealtCurrency: "x".repeat(9) }),
      ),
    ).toBe(false);
  });

  it("isCreateRfqRequestDto bounds the dealer list and requires finite positive numbers", () => {
    expect(isCreateRfqRequestDto(createRfqRequest())).toBe(true);
    expect(
      isCreateRfqRequestDto(
        createRfqRequest({
          dealerIds: Array.from({ length: 32 }, (_, i): number => {
            return i;
          }),
        }),
      ),
    ).toBe(true);
    expect(
      isCreateRfqRequestDto(
        createRfqRequest({
          dealerIds: Array.from({ length: 33 }, (_, i): number => {
            return i;
          }),
        }),
      ),
    ).toBe(false);
    expect(isCreateRfqRequestDto(createRfqRequest({ dealerIds: ["0"] }))).toBe(
      false,
    );
    expect(isCreateRfqRequestDto(createRfqRequest({ dealerIds: "all" }))).toBe(
      false,
    );
    expect(
      isCreateRfqRequestDto(
        createRfqRequest({ expirySecs: Number.POSITIVE_INFINITY }),
      ),
    ).toBe(false);
    expect(isCreateRfqRequestDto(createRfqRequest({ expirySecs: 0 }))).toBe(
      false,
    );
    expect(isCreateRfqRequestDto(createRfqRequest({ quantity: -5 }))).toBe(
      false,
    );
    expect(isCreateRfqRequestDto(createRfqRequest({ direction: "Hold" }))).toBe(
      false,
    );
  });

  it("isQuoteRequestDto needs a numeric quoteId and price", () => {
    expect(isQuoteRequestDto({ quoteId: 3, price: 101 })).toBe(true);
    expect(isQuoteRequestDto({ quoteId: 3 })).toBe(false);
    expect(isQuoteRequestDto({ quoteId: "3", price: 101 })).toBe(false);
  });

  it("isCandlesPayload allows an omitted timeframe but rejects an unknown one", () => {
    expect(isCandlesPayload({ symbol: "AAPL" })).toBe(true);
    expect(isCandlesPayload({ symbol: "AAPL", timeframe: "1W" })).toBe(true);
    expect(isCandlesPayload({ symbol: "AAPL", timeframe: "2Y" })).toBe(false);
    expect(isCandlesPayload({ timeframe: "1D" })).toBe(false);
  });

  it("isCandleHistoryPayload caps the page size and validates the timeframe", () => {
    expect(
      isCandleHistoryPayload({
        symbol: "AAPL",
        timeframe: "1D",
        beforeTime: 1,
        count: 200,
      }),
    ).toBe(true);
    expect(
      isCandleHistoryPayload({
        symbol: "AAPL",
        timeframe: "1D",
        beforeTime: 1,
        count: 2_000,
      }),
    ).toBe(true);
    expect(
      isCandleHistoryPayload({
        symbol: "AAPL",
        timeframe: "1D",
        beforeTime: 1,
        count: 2_001,
      }),
    ).toBe(false);
    expect(
      isCandleHistoryPayload({
        symbol: "AAPL",
        timeframe: "1D",
        beforeTime: 1,
        count: 0,
      }),
    ).toBe(false);
    expect(
      isCandleHistoryPayload({
        symbol: "AAPL",
        timeframe: "1D",
        beforeTime: 1,
        count: 1.5,
      }),
    ).toBe(false);
    expect(
      isCandleHistoryPayload({
        symbol: "AAPL",
        timeframe: "1D",
        beforeTime: Number.NaN,
        count: 10,
      }),
    ).toBe(false);
    expect(
      isCandleHistoryPayload({
        symbol: "AAPL",
        timeframe: "2Y",
        beforeTime: 1,
        count: 10,
      }),
    ).toBe(false);
  });

  it("isPlaceOrderRequest requires the side/type unions and a positive qty; limitPrice only when present", () => {
    expect(
      isPlaceOrderRequest({
        symbol: "AAPL",
        side: "buy",
        type: "market",
        qty: 10,
      }),
    ).toBe(true);
    expect(
      isPlaceOrderRequest({
        symbol: "AAPL",
        side: "sell",
        type: "limit",
        qty: 10,
        limitPrice: 101.5,
      }),
    ).toBe(true);
    expect(
      isPlaceOrderRequest({
        symbol: "AAPL",
        side: "hold",
        type: "market",
        qty: 10,
      }),
    ).toBe(false);
    expect(
      isPlaceOrderRequest({
        symbol: "AAPL",
        side: "buy",
        type: "stop",
        qty: 10,
      }),
    ).toBe(false);
    expect(
      isPlaceOrderRequest({
        symbol: "AAPL",
        side: "buy",
        type: "market",
        qty: 0,
      }),
    ).toBe(false);
    expect(
      isPlaceOrderRequest({
        symbol: "AAPL",
        side: "buy",
        type: "limit",
        qty: 1,
        limitPrice: "cheap",
      }),
    ).toBe(false);
  });

  it("requireValid returns the narrowed payload or throws MalformedPayloadError naming the frame type", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation((): void => {
      // silenced
    });

    try {
      expect(
        requireValid("x.y", { symbol: "EURUSD" }, isSymbolPayload),
      ).toEqual({ symbol: "EURUSD" });
      expect(warn).not.toHaveBeenCalled();

      expect((): unknown => {
        return requireValid(
          "x.y",
          { symbol: "<script>".repeat(4) },
          isSymbolPayload,
        );
      }).toThrowError(MalformedPayloadError);
      expect((): unknown => {
        return requireValid("x.y", {}, isSymbolPayload);
      }).toThrowError("malformed x.y payload");
    } finally {
      warn.mockRestore();
    }
  });

  it("requireValid warns once per rejected payload, naming the type and never the body", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation((): void => {
      // silenced
    });

    try {
      expect((): unknown => {
        return requireValid(
          "x.y",
          { symbol: "SECRET-BODY".repeat(2) },
          isSymbolPayload,
        );
      }).toThrowError(MalformedPayloadError);

      expect(warn).toHaveBeenCalledTimes(1);

      const line = String(warn.mock.calls[0]?.[0]);
      expect(line).toContain("x.y");
      expect(line).not.toContain("SECRET-BODY");
    } finally {
      warn.mockRestore();
    }
  });

  it("validated runs the handler on the narrowed request", () => {
    const run = vi.fn((request: SymbolPayload) => {
      return of(request.symbol.toLowerCase());
    });
    const seen: string[] = [];

    validated("x.y", { symbol: "EURUSD" }, isSymbolPayload, run).subscribe(
      (value: string): void => {
        seen.push(value);
      },
    );

    expect(seen).toEqual(["eurusd"]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("validated never throws synchronously: a malformed payload errors the stream on subscribe and skips the handler", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation((): void => {
      // silenced
    });

    const run = vi.fn((_request: SymbolPayload) => {
      return of("never");
    });

    try {
      // Call time: nothing happens yet — rpc()'s mergeMap would otherwise
      // see a synchronous throw and kill the whole effect.
      const result$ = validated("x.y", {}, isSymbolPayload, run);
      expect(run).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();

      let failure: unknown;
      result$.subscribe({
        error: (err: unknown): void => {
          failure = err;
        },
      });

      expect(failure).toBeInstanceOf(MalformedPayloadError);
      expect(run).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});

function createExecutionRequest(
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    currencyPair: "EURUSD",
    spotRate: 1.1,
    valueDate: "2026-10-06",
    direction: Direction.Buy,
    notional: 1_000_000,
    dealtCurrency: "EUR",
    ...overrides,
  };
}

function createRfqRequest(overrides: Record<string, unknown> = {}): unknown {
  return {
    instrumentId: 1,
    dealerIds: [0, 1],
    quantity: 1_000_000,
    direction: Direction.Buy,
    expirySecs: 120,
    ...overrides,
  };
}
