// packages/client-react-native/src/ui/rates/ticket/TradeTicketSheet.test.tsx
import { expect, jest, test } from "@jest/globals";

import type { CurrencyPair, Price } from "@rtc/domain";
import { Direction, PriceMovementType } from "@rtc/domain";

import { tradeTicketSheetPage } from "#tests/pages/TradeTicketSheetPage";

const mockExecute = jest.fn();
// `useTileExecution().state.status` mutable across renders — the auto-close
// test below drives it terminal -> ready across two `rerender()` calls to
// exercise TileExecutionMachine's real terminal-state contract (see
// TradeTicketSheet.tsx's own comment: "record that a terminal state was
// seen, then dismiss the sheet when the machine returns to ready").
let mockExecutionStatus: "ready" | "finished" | "timeout" = "ready";
// Shell motion, mutable across tests. Defaults OFF: every test here asserts
// content or wiring, none asserts an animation, and the off arm keeps
// ExecutionCeremony's repeating worklets from running under jest.
let mockMotionEnabled = false;
// Every `motionEnabled` argument `TradeTicketSheet` handed `sheetPresentation`,
// oldest first.
const mockPresentationCalls: boolean[] = [];
const mockPrice: Price = {
  symbol: "EURUSD",
  bid: 1.08716,
  ask: 1.0873,
  mid: 1.08723,
  spread: "1.4",
  movementType: PriceMovementType.UP,
  valueDate: "",
  creationTimestamp: 0,
};

const page = tradeTicketSheetPage();

const pair: CurrencyPair = {
  symbol: "EURUSD",
  ratePrecision: 5,
  pipsPosition: 4,
  base: "EUR",
  terms: "USD",
  defaultNotional: 1_000_000,
  baseMid: 1.08,
  typicalSpreadPips: 1,
};

test("executes a buy at the current notional", async () => {
  mockExecutionStatus = "ready";
  await page.mount(pair, jest.fn());
  expect(page.hasText("EUR/USD")).toBeTruthy();
  await page.press("buy-pad");
  expect(mockExecute).toHaveBeenCalledWith(Direction.Buy, mockPrice, 1_000_000);
});

// The double at `__mocks__/@gorhom/bottom-sheet.tsx` used to model
// `present`/`dismiss` without ever calling `onDismiss` — so this auto-close
// path (TileExecutionMachine's own terminal-state auto-dismiss timer,
// `TradeTicketSheet.tsx:62-68`: `dismiss()` -> the real component's
// `onDismiss` -> this component's `onClose`) had no assertion of its
// observable effect anywhere in the suite. Drives the mocked
// `useTileExecution().state.status` terminal -> ready across two
// `rerender()` calls to prove `onClose` fires exactly once, only once the
// machine returns to `ready` — not on the terminal state itself.
test("auto-close: dismissing on terminal -> ready fires onDismiss, which calls onClose", async () => {
  const onClose = jest.fn();
  mockExecutionStatus = "ready";
  await page.mount(pair, onClose);

  mockExecutionStatus = "finished";
  await page.rerender(pair, onClose);
  expect(onClose).not.toHaveBeenCalled();

  mockExecutionStatus = "ready";
  await page.rerender(pair, onClose);
  expect(onClose).toHaveBeenCalledTimes(1);
});

// The design's stamp beneath the pair (dc.html L494): `SPOT · T+2 · <clock>`.
// The clock is `SHELL_CLOCK` — the HUD's own decorative seed, the same value
// the status strip prints — not a wall-clock read, so the two surfaces cannot
// disagree and the ticket's golden reproduces. Asserted as the literal the
// user sees, so a change to that seed has to be a deliberate edit here too.
test("stamps the settlement line with the shell's clock", async () => {
  mockExecutionStatus = "ready";
  await page.mount(pair, jest.fn());

  expect(page.hasText("SPOT · T+2 · 09:47:03")).toBeTruthy();
});

// The reduced-motion / Freeze presentation is decided by `sheetPresentation`
// (unit-tested beside this file) and spread onto the sheet. What THIS test
// pins is the wiring in between — that the component asks with the LIVE motion
// flag rather than a constant. It is asserted through a module double because
// RNTL 14 removed the `UNSAFE_*` composite queries: `TestInstance` exposes
// host elements only, so pass-through configuration a component hands a
// library component (props nothing renders) is otherwise unobservable, and the
// package's `__mocks__/@gorhom/bottom-sheet.tsx` double cannot export a
// recorder either — Biome's `useComponentExportOnlyModules` is an error here,
// and a mock file may export only components.
test("asks for a presentation matching the live shell-motion flag", async () => {
  mockExecutionStatus = "ready";
  mockPresentationCalls.length = 0;

  mockMotionEnabled = false;
  await page.mount(pair, jest.fn());
  expect(mockPresentationCalls).toEqual([false]);

  mockMotionEnabled = true;
  await page.mount(pair, jest.fn());
  expect(mockPresentationCalls).toEqual([false, true]);

  mockMotionEnabled = false;
});

jest.mock("@rtc/react-bindings", () => {
  return {
    useViewModel: () => {
      return {
        usePrice: () => {
          return mockPrice;
        },
        useNotional: () => {
          return {
            state: {
              displayValue: "1,000,000",
              numericValue: 1_000_000,
              error: null,
            },
            change: jest.fn(),
            reset: jest.fn(),
          };
        },
        useTileExecution: () => {
          return {
            state: { status: mockExecutionStatus },
            execute: mockExecute,
            dismiss: jest.fn(),
          };
        },
      };
    },
  };
});

// Records the argument and then defers to the real implementation, so this
// double can never drift from the props the component actually spreads.
jest.mock("#/ui/rates/ticket/sheetPresentation", () => {
  const actual = jest.requireActual<
    typeof import("#/ui/rates/ticket/sheetPresentation")
  >("#/ui/rates/ticket/sheetPresentation");

  return {
    sheetPresentation: (motionEnabled: boolean) => {
      mockPresentationCalls.push(motionEnabled);
      return actual.sheetPresentation(motionEnabled);
    },
  };
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return mockMotionEnabled;
    },
  };
});
