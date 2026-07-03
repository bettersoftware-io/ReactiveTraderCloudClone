import type { JSX } from "react";

import { EquitiesScreen } from "#/ui/equities/EquitiesScreen";

/** The Equities tab — Markets, Trade and Blotters. Composition, the simulator
 * toggle and the connection banner live one level up in `_layout`. */
export default function EquitiesRoute(): JSX.Element {
  return <EquitiesScreen />;
}
