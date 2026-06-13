import type { ReactElement } from "react";
import type { Trade } from "@rtc/domain";
import type { ComponentToken, MountedComponent } from "../shared/harness/component";
import {
  PnlValue,
  ConnectionStatusBar,
  FxBlotter,
  QuickFilter,
  BlotterRow,
  BlotterHeader,
  SetFilter,
  NumberFilter,
  DateFilter,
  NewRfqForm,
} from "../shared/components";
import { PnlValue as PnlValueComponent } from "../../../../src/ui/fx/analytics/PnlValue";
import { ConnectionStatusBar as ConnectionStatusBarComponent } from "../../../../src/ui/shell/connection/ConnectionStatusBar";
import { FxBlotter as FxBlotterComponent } from "../../../../src/ui/fx/blotter/FxBlotter";
import { QuickFilter as QuickFilterComponent } from "../../../../src/ui/fx/blotter/QuickFilter";
import { BlotterRow as BlotterRowComponent } from "../../../../src/ui/fx/blotter/BlotterRow";
import { BlotterHeader as BlotterHeaderComponent } from "../../../../src/ui/fx/blotter/BlotterHeader";
import { SetFilter as SetFilterComponent } from "../../../../src/ui/fx/blotter/columnFilter/SetFilter";
import { NumberFilter as NumberFilterComponent } from "../../../../src/ui/fx/blotter/columnFilter/NumberFilter";
import { DateFilter as DateFilterComponent } from "../../../../src/ui/fx/blotter/columnFilter/DateFilter";
import type { ColumnFilter } from "../../../../src/ui/fx/blotter/columnFilter/filterState";
import type { SortState } from "../../../../src/ui/fx/blotter/columnSort";
import { NewRfqForm as NewRfqFormComponent } from "../../../../src/ui/credit/newRfq/NewRfqForm";

const noopFilter = (_f: ColumnFilter | null): void => {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToken = ComponentToken<any, MountedComponent<any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ElementFor = (props: Record<string, any>) => ReactElement;

/** token → React element factory. Identity-keyed; no string keys. */
export const registry = new Map<AnyToken, ElementFor>([
  [PnlValue, (p) => <PnlValueComponent value={p.value as number} />],
  [ConnectionStatusBar, () => <ConnectionStatusBarComponent />],
  [FxBlotter, () => <FxBlotterComponent />],
  [
    QuickFilter,
    (p) => (
      <QuickFilterComponent
        value={(p.value as string) ?? ""}
        onChange={(p.onChange as ((v: string) => void)) ?? (() => {})}
      />
    ),
  ],
  [
    BlotterRow,
    (p) => (
      <table>
        <tbody>
          <BlotterRowComponent trade={p.trade as Trade} isNew={(p.isNew as boolean) ?? false} />
        </tbody>
      </table>
    ),
  ],
  [
    BlotterHeader,
    (p) => (
      <table>
        <thead>
          <BlotterHeaderComponent
            sort={(p.sort as SortState) ?? { column: null, direction: null }}
            onSort={(p.onSort as ((c: keyof Trade) => void)) ?? (() => {})}
            filters={(p.filters as Map<keyof Trade, ColumnFilter>) ?? new Map()}
            onFilter={
              (p.onFilter as ((c: keyof Trade, f: ColumnFilter | null) => void)) ?? (() => {})
            }
            trades={(p.trades as readonly Trade[]) ?? []}
          />
        </thead>
      </table>
    ),
  ],
  [
    SetFilter,
    (p) => (
      <SetFilterComponent
        column={(p.column as keyof Trade) ?? "currencyPair"}
        trades={(p.trades as readonly Trade[]) ?? []}
        currentFilter={p.currentFilter as ColumnFilter | undefined}
        onApply={(p.onApply as ((f: ColumnFilter | null) => void)) ?? noopFilter}
      />
    ),
  ],
  [
    NumberFilter,
    (p) => (
      <NumberFilterComponent
        column={(p.column as keyof Trade) ?? "notional"}
        currentFilter={p.currentFilter as ColumnFilter | undefined}
        onApply={(p.onApply as ((f: ColumnFilter | null) => void)) ?? noopFilter}
      />
    ),
  ],
  [
    DateFilter,
    (p) => (
      <DateFilterComponent
        column={(p.column as keyof Trade) ?? "tradeDate"}
        currentFilter={p.currentFilter as ColumnFilter | undefined}
        onApply={(p.onApply as ((f: ColumnFilter | null) => void)) ?? noopFilter}
      />
    ),
  ],
  [NewRfqForm, (p) => <NewRfqFormComponent onCreated={(p.onCreated as ((id: number) => void)) ?? (() => {})} />],
]);
