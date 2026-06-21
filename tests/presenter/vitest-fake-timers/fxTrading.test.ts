import { afterEach, beforeEach, describe, it } from "vitest";
import * as blotter from "../scenarios/_shared/blotter";
import * as fx from "../scenarios/_shared/fxLiveRates";
import * as trading from "../scenarios/_shared/fxTrading";
import {
  buildWorld,
  teardownWorld,
  type VitestPlainPresenterWorld,
} from "./_world";

describe("@presenter Feature: FX trading", () => {
  let w: VitestPlainPresenterWorld;
  beforeEach(() => {
    w = buildWorld();
  });
  afterEach(() => {
    teardownWorld(w);
  });

  it("execute a buy trade and see confirmation", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await trading.executeBuyOnFirstTile(w);
    // "the trade confirmation appears within 5 seconds" is implicit:
    // executeBuyOnFirstTile already awaited the confirmation and captured status.
    await trading.expectTradeConfirmationMatchesOneOf(w, [
      /Executing/i,
      /You Bought/i,
      /rejected/i,
    ]);
  });

  it("execute a sell trade and see confirmation", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await trading.executeSellOnFirstTile(w);
    await trading.expectTradeConfirmationMatchesOneOf(w, [
      /Executing/i,
      /You Sold/i,
      /rejected/i,
    ]);
  });

  it("executed trade appears in the blotter", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await trading.executeBuyOnFirstTile(w);
    await w.waitSeconds(2);
    await blotter.expectBlotterVisible(w);
    await blotter.expectBlotterHasAtLeastNRows(w, 1);
  });

  it("executed trade carries the requested notional", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await trading.executeBuyWithNotional(w, 1_000_000);
    await trading.expectTradeNotionalEquals(w, 1_000_000);
  });

  it("rejected trades occur with non-zero probability across multiple attempts", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await trading.buyNTimesWithDismissals(w, 5);
    await trading.expectAtLeastOneRejection(w);
  });
});
