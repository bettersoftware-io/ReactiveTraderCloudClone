import { render, renderHook } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AppHooks } from "#/ui/hooks/createAppHooks";
import { HooksContext } from "#/ui/hooks/HooksContext";

import { ThemeProvider } from "./ThemeProvider";
import { themeTokens } from "./tokens";
import { useTheme } from "./useTheme";

describe("useTheme", () => {
  it("throws when rendered outside a ThemeProvider", () => {
    // With no provider mounted the context is null, so the guard throws on the
    // first render. Silence React's expected error-boundary console output.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => {
        return useTheme();
      });
    }).toThrow("useTheme must be used within ThemeProvider");
    spy.mockRestore();
  });
});

describe("ThemeProvider", () => {
  function mountWith(skin: "classic" | "holo" | "terminal" | "neon"): void {
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
    } as unknown as AppHooks;

    function Wrapper({ children }: WrapperProps): ReactElement {
      return (
        <HooksContext.Provider value={hooks}>{children}</HooksContext.Provider>
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

  it("writes dataset.skin/dataset.mode and paints the skin×mode tokens on :root", () => {
    mountWith("holo");

    const root = document.documentElement;
    expect(root.dataset.skin).toBe("holo");
    expect(root.dataset.mode).toBe("dark");
    expect(
      getComputedStyle(root).getPropertyValue("--accent-primary").trim(),
    ).toBe(themeTokens.holo.dark["--accent-primary"]);
  });
});

interface WrapperProps {
  children: ReactNode;
}
