import { expect, jest, test } from "@jest/globals";

import type { CurrencyPair } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

// `require`, not `import * as` — a namespace import goes through Babel's
// `interopRequireWildcard`, which (since react-native's CJS export isn't
// flagged `__esModule`) shallow-copies the module into a *new* object; a spy
// on that copy would never be seen by SpotTileGrid.tsx's own named import,
// which binds directly to the real `require("react-native")` singleton.
const ReactNative = require("react-native") as typeof import("react-native");

const { SpotTileGrid } =
  require("./SpotTileGrid") as typeof import("./SpotTileGrid");

test("phone-width viewport still renders a 2-column grid", async () => {
  jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
    width: 393,
    height: 852,
    scale: 3,
    fontScale: 1,
  });

  const { toJSON } = await renderWithTheme(
    <SpotTileGrid
      pairs={[pair("EURUSD"), pair("USDJPY")]}
      onOpenTicket={noop}
    />,
  );

  const cellWidths = collectCellWidths(toJSON());
  // fxColumnCount(393) is 1 below the tablet breakpoint — SpotTileGrid floors
  // it to 2 so phones still get a 2-up grid, i.e. each cell is 50% wide.
  expect(cellWidths).toEqual(["50%", "50%"]);
});

function noop(): void {}

function pair(symbol: string): CurrencyPair {
  return {
    symbol,
    ratePrecision: 5,
    pipsPosition: 4,
    base: symbol.slice(0, 3),
    terms: symbol.slice(3),
    defaultNotional: 1_000_000,
    baseMid: 1,
    typicalSpreadPips: 1,
  };
}

interface RenderedNode {
  props?: { style?: unknown };
  children?: unknown[];
}

interface WidthStyle {
  width: string;
}

// Walks the rendered JSON tree collecting every node's `style.width`, where
// present, in tree order — the per-cell Animated.View wrapper is the only
// place SpotTileGrid sets an explicit percentage width.
function collectCellWidths(node: unknown): string[] {
  if (node === null || node === undefined) {
    return [];
  }

  if (Array.isArray(node)) {
    return node.flatMap(collectCellWidths);
  }

  if (typeof node !== "object") {
    return [];
  }

  const { props, children } = node as RenderedNode;
  const widths: string[] = [];
  const style = props?.style;
  const flat = Array.isArray(style) ? style : [style];

  for (const entry of flat) {
    if (isWidthStyle(entry)) {
      widths.push(entry.width);
    }
  }

  return [...widths, ...collectCellWidths(children ?? [])];
}

function isWidthStyle(entry: unknown): entry is WidthStyle {
  return (
    entry !== null &&
    typeof entry === "object" &&
    "width" in entry &&
    typeof (entry as Record<string, unknown>).width === "string"
  );
}

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return false;
    },
  }; // static in tests — no reanimated layout
});

jest.mock("@rtc/react-bindings", () => {
  return {
    useViewModel: () => {
      return {
        usePrice: () => {
          return null;
        },
      };
    },
  };
});
