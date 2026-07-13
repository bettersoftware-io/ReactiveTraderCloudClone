import { render, renderHook } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { describe, expect, it } from "vitest";

import type { ViewModel } from "@rtc/solid-bindings";
import { ViewModelContext } from "@rtc/solid-bindings";

import { ThemeProvider } from "./ThemeProvider";
import { themeTokens } from "./tokens";
import { useTheme } from "./useTheme";

describe("useTheme", () => {
  it("throws when rendered outside a ThemeProvider", () => {
    expect(() => {
      renderHook(() => {
        return useTheme();
      });
    }).toThrow("useTheme must be used within ThemeProvider");
  });
});

describe("ThemeProvider", () => {
  function mountWith(skin: "classic" | "holo" | "terminal" | "neon"): void {
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
  children: JSX.Element;
}
