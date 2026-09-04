// packages/client-react-native/tests/pages/AnalyticsScreenPage.tsx
import { screen } from "@testing-library/react-native";

import type { PositionUpdates } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AnalyticsScreen } from "#/ui/analytics/AnalyticsScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function fakeViewModel(
  data: PositionUpdates | null,
  stale: boolean,
): ViewModel {
  return {
    useAnalytics: () => {
      return data;
    },
    useAnalyticsStaleFlag: () => {
      return stale;
    },
  } as unknown as ViewModel;
}

export interface AnalyticsScreenPage {
  mount(data: PositionUpdates | null, stale: boolean): Promise<void>;
  exists(testId: string): boolean;
  /** testIDs of every node matching `pattern`, in RENDER order — the base
   * spec's `getAllByTestId(pattern).map(n => n.props.testID)`, which exists
   * specifically because testIDs alone can't express card ORDER. */
  testIdsMatching(pattern: RegExp): readonly string[];
}

/** The framework surface for `AnalyticsScreen.test.tsx`. Relies on the
 * spec's own `jest.mock` of `useShellMotionEnabled`, hoisted above every
 * import in the spec file. */
export function analyticsScreenPage(): AnalyticsScreenPage {
  return {
    async mount(data: PositionUpdates | null, stale: boolean): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={fakeViewModel(data, stale)}>
          <AnalyticsScreen />
        </ViewModelProvider>,
      );
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    testIdsMatching(pattern: RegExp): readonly string[] {
      return screen.getAllByTestId(pattern).map((node) => {
        return node.props.testID as string;
      });
    },
  };
}
