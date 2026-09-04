// packages/client-react-native/tests/pages/PnlChartPage.tsx
import { cleanup, screen } from "@testing-library/react-native";

import type { HistoricPosition } from "@rtc/domain";

import { PnlChart } from "#/ui/analytics/PnlChart";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface PnlChartPage {
  mount(history: readonly HistoricPosition[]): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
}

/**
 * The framework surface for `PnlChart.test.tsx`. Skia is mocked, so no pixel
 * is asserted — and Skia elements are not RN views, so they carry no
 * `testID` to query either. What these prove is that the component mounts
 * and builds its paths across every history shape it can receive without
 * throwing. WHETHER a line is drawn is a pure function of the history,
 * asserted directly in `buildChart.test.ts`.
 */
export function pnlChartPage(): PnlChartPage {
  return {
    async mount(history: readonly HistoricPosition[]): Promise<void> {
      await renderWithTheme(<PnlChart history={history} />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
  };
}
