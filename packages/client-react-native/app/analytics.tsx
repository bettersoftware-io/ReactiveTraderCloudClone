import type { JSX } from "react";

import { AnalyticsScreen } from "#/ui/analytics/AnalyticsScreen";

/** The Analytics tab — FX P&L and position exposure. Composition, the
 * simulator toggle and the connection banner live one level up in `_layout`. */
export default function AnalyticsRoute(): JSX.Element {
  return <AnalyticsScreen />;
}
