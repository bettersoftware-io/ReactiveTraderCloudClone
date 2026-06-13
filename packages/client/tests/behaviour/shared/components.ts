import { component } from "./harness/component";
import { PnlValuePage, type PnlValueProps } from "./pages/fx/analytics/PnlValuePage";
import { ConnectionStatusBarPage } from "./pages/shell/connection/ConnectionStatusBarPage";
import { FxBlotterPage } from "./pages/fx/blotter/FxBlotterPage";

export const PnlValue = component<PnlValueProps, PnlValuePage>(
  (ctx) => new PnlValuePage(ctx),
);

export const ConnectionStatusBar = component<Record<string, never>, ConnectionStatusBarPage>(
  (ctx) => new ConnectionStatusBarPage(ctx),
);

export const FxBlotter = component<Record<string, never>, FxBlotterPage>(
  (ctx) => new FxBlotterPage(ctx),
);
