// packages/client-react-native/tests/pages/BlotterModulePage.tsx
import {
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react-native";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface BlotterModulePage {
  mount(): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasTextMatching(pattern: RegExp): boolean;
  /** Presses the text found inside a named container (e.g. the filter chip
   * strip), rather than a bare page-wide text query — the base spec's
   * `within(screen.getByTestId(containerTestId)).getByText(text)`. */
  pressTextWithin(containerTestId: string, text: string): Promise<void>;
  /** Reads the text found inside a named row (e.g. a trade row), asserting it
   * exists — the base spec's
   * `within(screen.getByTestId(rowTestId)).getByText(text)`. */
  hasTextWithin(rowTestId: string, text: string): boolean;
}

/** The framework surface for `BlotterModule.test.tsx`. Relies on the spec's
 * own `jest.mock` of `@rtc/react-bindings` and `useShellMotionEnabled`,
 * hoisted above every import in the spec file.
 *
 * `BlotterModule` is `require()`d lazily inside `mount()` rather than
 * imported at this module's top — a static top-level import here would be
 * transformed to a `require()` placed ABOVE the spec's own `const mockTrades
 * = jest.fn()` (babel-plugin-jest-hoist hoists `jest.mock()` calls above
 * every `import`, but a page module's own imports still run in the spec's
 * import order, before the spec's later `const` statements). `BlotterModule`
 * imports `@rtc/react-bindings` at ITS OWN module top, which would trigger
 * the spec's mocked factory before `mockTrades` exists — a
 * `ReferenceError`. Deferring the require into `mount()`, called from inside
 * a `test()` body (i.e. after the whole spec file's top level, `mockTrades`
 * included, has already run), sidesteps the ordering trap entirely. Mirrors
 * the base spec's own identical `require()` placement, one file scope over. */
export function blotterModulePage(): BlotterModulePage {
  return {
    async mount(): Promise<void> {
      const { BlotterModule } =
        require("#/ui/blotter/BlotterModule") as typeof import("#/ui/blotter/BlotterModule");
      await renderWithTheme(<BlotterModule />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    hasTextMatching(pattern: RegExp): boolean {
      return screen.queryByText(pattern) != null;
    },
    async pressTextWithin(
      containerTestId: string,
      text: string,
    ): Promise<void> {
      await fireEvent.press(
        within(screen.getByTestId(containerTestId)).getByText(text),
      );
    },
    hasTextWithin(rowTestId: string, text: string): boolean {
      return within(screen.getByTestId(rowTestId)).queryByText(text) != null;
    },
  };
}
