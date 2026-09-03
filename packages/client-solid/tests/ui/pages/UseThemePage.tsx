import { render, renderHook } from "@solidjs/testing-library";
import type { JSX } from "solid-js";

import type { ViewModel } from "@rtc/solid-bindings";
import { ViewModelContext } from "@rtc/solid-bindings";

import { ThemeProvider } from "#/ui/shell/theme/ThemeProvider";
import { useTheme } from "#/ui/shell/theme/useTheme";

interface WrapperProps {
  children: JSX.Element;
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
        mode: () => {
          return "dark";
        },
        modePreference: () => {
          return "dark";
        },
        cycle: () => {},
      };
    },
    useThemeSkinPreference: () => {
      return {
        skin: () => {
          return skin;
        },
        setSkin: () => {},
      };
    },
  } as unknown as ViewModel;

  function Wrapper(props: WrapperProps): JSX.Element {
    return (
      <ViewModelContext.Provider value={hooks}>
        {props.children}
      </ViewModelContext.Provider>
    );
  }

  render(() => {
    return (
      <Wrapper>
        <ThemeProvider>
          <div />
        </ThemeProvider>
      </Wrapper>
    );
  });
}
