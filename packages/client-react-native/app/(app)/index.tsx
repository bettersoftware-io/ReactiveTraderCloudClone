import type { JSX } from "react";

import { TileGrid } from "#/ui/TileGrid";

/** The Rates tab — the live FX spot-tile grid. Composition, the simulator
 * toggle and the connection banner now live one level up in `_layout`. */
export default function RatesScreen(): JSX.Element {
  return <TileGrid />;
}
