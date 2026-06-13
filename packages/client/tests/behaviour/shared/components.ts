import { component } from "./harness/component";
import { PnlValuePage, type PnlValueProps } from "./pages/fx/analytics/PnlValuePage";

export const PnlValue = component<PnlValueProps, PnlValuePage>(
  (ctx) => new PnlValuePage(ctx),
);
