import type { JSX } from "react";

import { CreditScreen } from "#/ui/credit/CreditScreen";

/** The Credit tab — RFQ Tiles, New RFQ and Sell Side. Composition, the
 * simulator toggle and the connection banner live one level up in `_layout`. */
export default function CreditRoute(): JSX.Element {
  return <CreditScreen />;
}
