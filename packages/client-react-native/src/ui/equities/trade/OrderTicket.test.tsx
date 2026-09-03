import { afterEach, expect, jest, test } from "@jest/globals";

import type { OrderTicketState } from "@rtc/client-core";

import { rnThemeTokens } from "#/ui/theme/tokens";
import { orderTicketPage } from "#tests/pages/OrderTicketPage";

const editing: OrderTicketState = {
  phase: "editing",
  form: { symbol: "AAPL", side: "buy", type: "market", qty: 100 },
  error: null,
};

const page = orderTicketPage();

afterEach(() => {
  return page.unmountAll();
});

test("editing phase submits with the current side and symbol", async () => {
  const submit = jest.fn();
  await page.mount(editing, { submit });
  expect(
    page.hasTextContent("order-ticket-submit", "BUY 100 AAPL · MARKET"),
  ).toBe(true);
  await page.press("order-ticket-submit");
  expect(submit).toHaveBeenCalledTimes(1);
});

test("quantity chips dispatch setQty and light the matching preset", async () => {
  const setQty = jest.fn();
  await page.mount(editing, { setQty });
  expect(page.hasTextContent("order-ticket-qty-1000", "1K")).toBe(true);
  expect(page.hasTextContent("order-ticket-qty-5000", "5K")).toBe(true);
  expect(page.selected("order-ticket-qty-100")).toBe(true);
  expect(page.selected("order-ticket-qty-500")).toBe(false);
  await page.press("order-ticket-qty-5000");
  expect(setQty).toHaveBeenCalledWith(5000);
});

test("LMT shows the limit stepper seeded from the last price, stepping by a dime", async () => {
  const setLimitPrice = jest.fn();
  const limitEditing: OrderTicketState = {
    phase: "editing",
    form: { symbol: "AAPL", side: "sell", type: "limit", qty: 1000 },
    error: null,
  };
  await page.mount(limitEditing, { setLimitPrice });
  expect(page.hasTextContent("order-ticket-limit", "189.50")).toBe(true);
  await page.press("order-ticket-limit-up");
  expect(setLimitPrice).toHaveBeenCalledWith(189.6);
  await page.press("order-ticket-limit-down");
  expect(setLimitPrice).toHaveBeenCalledWith(189.4);
  expect(
    page.hasTextContent("order-ticket-submit", "SELL 1K AAPL · @ 189.50"),
  ).toBe(true);
});

test("a set limit price wins over the last price", async () => {
  const limitEditing: OrderTicketState = {
    phase: "editing",
    form: {
      symbol: "AAPL",
      side: "buy",
      type: "limit",
      qty: 500,
      limitPrice: 131.14,
    },
    error: null,
  };
  await page.mount(limitEditing);
  expect(page.hasTextContent("order-ticket-limit", "131.14")).toBe(true);
  expect(
    page.hasTextContent("order-ticket-submit", "BUY 500 AAPL · @ 131.14"),
  ).toBe(true);
});

test("MKT hides the stepper and the CTA omits an unset quantity", async () => {
  const bare: OrderTicketState = {
    phase: "editing",
    form: { symbol: "AAPL", side: "buy", type: "market", qty: 0 },
    error: null,
  };
  await page.mount(bare);
  expect(page.exists("order-ticket-limit")).toBe(false);
  expect(page.hasTextContent("order-ticket-submit", "BUY AAPL · MARKET")).toBe(
    true,
  );
});

test("filled phase shows the fill summary and a reset control", async () => {
  const reset = jest.fn();
  const filled: OrderTicketState = {
    phase: "filled",
    order: {
      id: "o1",
      symbol: "AAPL",
      side: "buy",
      type: "market",
      qty: 100,
      status: "filled",
      filledQty: 100,
      avgPrice: 182.4,
      createdAt: 0,
    },
  };
  await page.mount(filled, { reset });
  expect(page.containsTextContent("order-ticket", "FILLED")).toBe(true);
  await page.press("order-ticket-reset");
  expect(reset).toHaveBeenCalledTimes(1);
});

test("rejected phase surfaces the reason", async () => {
  const rejected: OrderTicketState = {
    phase: "rejected",
    reason: "Insufficient buying power",
  };
  await page.mount(rejected);
  expect(
    page.containsTextContent("order-ticket", "Insufficient buying power"),
  ).toBe(true);
});

// dc.html:2371 — the CTA is `linear-gradient(180deg, sideC, color-mix(in
// oklab, sideC 72%, black))` in every skin; CtaGradient paints the ramp over
// the flat side-colour fallback.
test("the submit CTA carries the side-colour ramp gradient", async () => {
  const submit = jest.fn();
  await page.mount(editing, { submit });
  expect(page.exists("cta-gradient")).toBe(true);
});

// dc.html:385 — the design's order-ticket panel is a `--tile-bg` /
// `--tile-shadow` surface exactly like the instrument tile above it, so 3d
// skins paint the tile gradient. (This asserted the opposite until
// 2026-09-02, reading the panel as "dense, not a hero tile" — the prototype
// disagrees.)
test("renders the gradient tile surface on 3d skins", async () => {
  const submit = jest.fn();
  await page.mount(editing, { submit }, rnThemeTokens.holo3d.dark);
  expect(page.exists("surface-sheen")).toBe(true);
});

// `page.mount()` doesn't stub `usePowerSaver`, which `OrderCeremony`'s
// fill/reject toast would otherwise call via `useShellMotionEnabled` on the
// filled/rejected phases — mirrors TradeView.test.tsx / EquitiesScreen.test.tsx.
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
