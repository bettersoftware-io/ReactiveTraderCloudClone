import { component } from "./harness/component";
import { PnlValuePage, type PnlValueProps } from "./pages/fx/analytics/PnlValuePage";
import { ConnectionStatusBarPage } from "./pages/shell/connection/ConnectionStatusBarPage";

export const PnlValue = component<PnlValueProps, PnlValuePage>(
  (ctx) => new PnlValuePage(ctx),
);

export const ConnectionStatusBar = component<Record<string, never>, ConnectionStatusBarPage>(
  (ctx) => new ConnectionStatusBarPage(ctx),
);
