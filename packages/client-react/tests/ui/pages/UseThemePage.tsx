import { render, renderHook } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { vi } from "vitest";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

import { ThemeProvider } from "#/ui/shell/theme/ThemeProvider";
import { useTheme } from "#/ui/shell/theme/useTheme";

interface WrapperProps {
  children: ReactNode;
}

export type ThemeSkin = "classic" | "holo" | "terminal" | "neon";

/** The framework surface for `useTheme.test.tsx`: renders the hook with no
 * provider mounted, so the guard's context-missing throw is observable by
 * wrapping this call in `expect(...).toThrow(...)`. */
export function renderThemeHook(): void {
  renderHook(() => {
    return useTheme();
  });
}

/** Mounts `ThemeProvider` under a stubbed ViewModel fixed to the given skin,
 * dark mode. Asserted against via `document.documentElement`'s own
 * dataset/computed-style, not a query returned from this call. */
export function mountThemeProvider(skin: ThemeSkin): void {
  const hooks = {
    useThemePreference: () => {
      return {
        mode: "dark",
        modePreference: "dark",
        cycle: vi.fn(),
      };
    },
    useThemeSkinPreference: () => {
      return { skin, setSkin: vi.fn() };
    },
  } as unknown as ViewModel;

  function Wrapper({ children }: WrapperProps): ReactElement {
    return (
      <ViewModelContext.Provider value={hooks}>
        {children}
      </ViewModelContext.Provider>
    );
  }

  render(
    <Wrapper>
      <ThemeProvider>
        <div />
      </ThemeProvider>
    </Wrapper>,
  );
}
