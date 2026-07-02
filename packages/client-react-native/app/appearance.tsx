import type { JSX } from "react";

import { AppearanceScreen } from "#/ui/AppearanceScreen";

/** The Appearance tab — mode cycle + skin picker. Composition, the simulator
 * toggle, the connection banner and the ThemeProvider live one level up in
 * `_layout`. */
export default function AppearanceRoute(): JSX.Element {
  return <AppearanceScreen />;
}
