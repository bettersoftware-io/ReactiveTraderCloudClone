// packages/client-react-native/tests/pages/ExecutionCeremonyPage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";

import type { TileExecutionState } from "@rtc/client-core";
import type { Direction } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

export interface ExecutionCeremonyPage {
  mount(state: TileExecutionState, direction: Direction | null): Promise<void>;
  /** `rerender` (unlike `render`/`renderWithTheme`) swaps the tree at the
   * SAME root verbatim — it does NOT re-apply `renderWithTheme`'s own
   * `ThemeContext.Provider` wrapping, so it's reapplied explicitly here,
   * mirroring the base spec's own `rerender(<ThemeContext.Provider ...>)`
   * calls. */
  rerender(
    state: TileExecutionState,
    direction: Direction | null,
  ): Promise<void>;
  unmountAll(): Promise<void>;
  isEmpty(): boolean;
  hasText(text: string): boolean;
  hasTextMatching(pattern: RegExp): boolean;
}

/** The framework surface for `ExecutionCeremony.test.tsx`.
 *
 * `ExecutionCeremony` is `require()`d lazily via `loadComponent()` — a
 * single factory-scoped helper, called from both `mount()` and `rerender()`'s
 * `tree()` builder, rather than a separate `require()` at each call site —
 * instead of imported at this module's top. A static top-level import here
 * would resolve `ExecutionCeremony`'s own `expo-haptics`/
 * `useShellMotionEnabled` imports before the spec's `jest.mock("expo-haptics",
 * ...)` factory is what the module system resolves against, since a page
 * module's own imports still run in the spec's normal import order
 * (`jest.mock()` is hoisted above every `import`, not above a page's LAZY
 * require calls). Mirrors the base spec's own identical `require()`
 * placement, one file scope over — jest's module registry caches the
 * `require()`, so calling `loadComponent()` more than once costs nothing. */
export function executionCeremonyPage(): ExecutionCeremonyPage {
  function loadComponent(): typeof import("#/ui/rates/ticket/ExecutionCeremony") {
    return require("#/ui/rates/ticket/ExecutionCeremony") as typeof import("#/ui/rates/ticket/ExecutionCeremony");
  }

  function tree(
    state: TileExecutionState,
    direction: Direction | null,
  ): ReactElement {
    const { ExecutionCeremony } = loadComponent();
    return (
      <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
        <ExecutionCeremony state={state} direction={direction} />
      </ThemeContext.Provider>
    );
  }

  let rerenderFn: ((el: ReactElement) => Promise<void>) | undefined;

  return {
    async mount(
      state: TileExecutionState,
      direction: Direction | null,
    ): Promise<void> {
      const { ExecutionCeremony } = loadComponent();

      const result = await renderWithTheme(
        <ExecutionCeremony state={state} direction={direction} />,
      );
      rerenderFn = result.rerender;
    },
    async rerender(
      state: TileExecutionState,
      direction: Direction | null,
    ): Promise<void> {
      if (!rerenderFn) {
        throw new Error("mount() must be called before rerender()");
      }

      await rerenderFn(tree(state, direction));
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    isEmpty(): boolean {
      return screen.toJSON() === null;
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    hasTextMatching(pattern: RegExp): boolean {
      return screen.queryByText(pattern) != null;
    },
  };
}
