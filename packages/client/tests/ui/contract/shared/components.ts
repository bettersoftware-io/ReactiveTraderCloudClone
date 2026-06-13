import { component } from "./harness/component";
import { PnlValuePage, type PnlValueProps } from "./pages/fx/analytics/PnlValuePage";
import { ConnectionStatusBarPage } from "./pages/shell/connection/ConnectionStatusBarPage";
import { FxBlotterPage } from "./pages/fx/blotter/FxBlotterPage";
import { QuickFilterPage, type QuickFilterProps } from "./pages/fx/blotter/QuickFilterPage";
import { BlotterRowPage, type BlotterRowProps } from "./pages/fx/blotter/BlotterRowPage";
import { BlotterHeaderPage, type BlotterHeaderProps } from "./pages/fx/blotter/BlotterHeaderPage";
import { SetFilterPage, type SetFilterProps } from "./pages/fx/blotter/SetFilterPage";
import { NumberFilterPage, type NumberFilterProps } from "./pages/fx/blotter/NumberFilterPage";
import { DateFilterPage, type DateFilterProps } from "./pages/fx/blotter/DateFilterPage";
import { NewRfqFormPage, type NewRfqFormProps } from "./pages/credit/newRfq/NewRfqFormPage";

export const PnlValue = component<PnlValueProps, PnlValuePage>(
  (ctx) => new PnlValuePage(ctx),
);

export const ConnectionStatusBar = component<Record<string, never>, ConnectionStatusBarPage>(
  (ctx) => new ConnectionStatusBarPage(ctx),
);

export const FxBlotter = component<Record<string, never>, FxBlotterPage>(
  (ctx) => new FxBlotterPage(ctx),
);

export const QuickFilter = component<QuickFilterProps, QuickFilterPage>(
  (ctx) => new QuickFilterPage(ctx),
);

export const BlotterRow = component<BlotterRowProps, BlotterRowPage>(
  (ctx) => new BlotterRowPage(ctx),
);

export const BlotterHeader = component<BlotterHeaderProps, BlotterHeaderPage>(
  (ctx) => new BlotterHeaderPage(ctx),
);

export const SetFilter = component<SetFilterProps, SetFilterPage>(
  (ctx) => new SetFilterPage(ctx),
);

export const NumberFilter = component<NumberFilterProps, NumberFilterPage>(
  (ctx) => new NumberFilterPage(ctx),
);

export const DateFilter = component<DateFilterProps, DateFilterPage>(
  (ctx) => new DateFilterPage(ctx),
);

export const NewRfqForm = component<NewRfqFormProps, NewRfqFormPage>(
  (ctx) => new NewRfqFormPage(ctx),
);
