import type { JSX, ParentProps } from "solid-js";
import { createEffect } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { ThemeContext } from "./ThemeContext";
import { type ThemeTokens, themeTokens } from "./tokens";

export function ThemeProvider(props: ParentProps): JSX.Element {
  // Persistence/state lives behind the seam (PreferencesPort); the provider
  // only reads the current theme and paints the CSS tokens for it.
  //
  // The DOM writes below (CSS variables on :root + dataset.skin/dataset.mode)
  // intentionally STAY here: applying a theme to the document is RENDERING, which
  // is the View's job — not business logic, transport, or persistence (Dumb-UI
  // forbids those, not painting). The token VALUES (themeTokens) are data and the
  // skin/mode CHOICE is a port; only the paint remains, and it is coupled to the
  // WEB render target (`document.documentElement`) — exactly the layer that gets
  // rewritten per target (a SolidJS web app writes the same :root vars; a React
  // Native app applies the theme its own way in its own ThemeProvider). Wrapping
  // this behind a port would be over-abstraction: ports are I/O boundaries, not
  // "how the View paints".
  const { useThemePreference, useThemeSkinPreference } = useViewModel();
  const { mode, modePreference, cycle: cycleMode } = useThemePreference();
  const { skin, setSkin } = useThemeSkinPreference();

  createEffect(() => {
    applyTokens(themeTokens[skin()][mode()]);
    document.documentElement.dataset.skin = skin();
    document.documentElement.dataset.mode = mode();
  });

  return (
    <ThemeContext.Provider
      value={{ skin, mode, modePreference, setSkin, cycleMode }}
    >
      {props.children}
    </ThemeContext.Provider>
  );
}

function applyTokens(tokens: ThemeTokens): void {
  const root = document.documentElement;

  for (const [prop, value] of Object.entries(tokens)) {
    root.style.setProperty(prop, value);
  }
}
