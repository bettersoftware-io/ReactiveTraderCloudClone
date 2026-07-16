import {
  AmbientBackground,
  AnalyticsHead,
  AnalyticsPanel,
  AnimationProbe,
  BlotterHeader,
  BlotterRow,
  BootGate,
  BootSequence,
  ConnectionOverlay,
  ConnectionStatusBar,
  CreditBlotter,
  CreditBlotterHead,
  CreditBlotterWorkspace,
  CurrencyFilter,
  DateFilter,
  FxBlotter,
  FxBlotterWorkspace,
  HeaderChrome,
  LayoutEngine,
  LiveRatesPanel,
  LiveRatesWorkspace,
  LockScreen,
  NewRfqHead,
  NewRfqPanel,
  NumberFilter,
  PairPnlBars,
  PnlChart,
  PnlValue,
  PositionsHead,
  PositionsPanel,
  PreferencesModal,
  QuickFilter,
  RfqCountdown,
  RfqFilterPills,
  RfqsHead,
  RfqsPanel,
  SellSidePanel,
  SetFilter,
  SpreadDisplay,
  StaleIndicator,
  StatusBar,
  ThemePicker,
  ThemeToggle,
  Tile,
  TileConfirmation,
  TileFooter,
  TileHeader,
  TileNotional,
  TilePrice,
  TileRfq,
  TradeTicket,
} from "@ui-contract/components";
import type {
  ComponentToken,
  MountedComponent,
} from "@ui-contract/harness/component";
import type { Accessor, JSX } from "solid-js";

import type {
  ColumnFilter,
  NotionalIntents,
  NotionalView,
  PanelId,
  RfqState,
  RfqTileIntents,
  SortState,
  TileExecutionState,
} from "@rtc/client-core";
import type {
  CreditRfqFilter,
  CurrencyCategory,
  CurrencyPair,
  CurrencyPairPosition,
  Direction,
  HistoricPosition,
  Instrument,
  Price,
  PriceMovementType,
  Quote,
  Rfq,
  Trade,
} from "@rtc/domain";

import { CreditBlotter as CreditBlotterComponent } from "#/ui/credit/blotter/CreditBlotter";
import { CreditBlotterHead as CreditBlotterHeadComponent } from "#/ui/credit/blotter/CreditBlotterHead";
import { NewRfqHead as NewRfqHeadComponent } from "#/ui/credit/newRfq/NewRfqHead";
import { NewRfqPanel as NewRfqPanelComponent } from "#/ui/credit/newRfq/NewRfqPanel";
import { RfqFilterPills as RfqFilterPillsComponent } from "#/ui/credit/rfqs/RfqFilterPills";
import { RfqsHead as RfqsHeadComponent } from "#/ui/credit/rfqs/RfqsHead";
import { RfqsPanel as RfqsPanelComponent } from "#/ui/credit/rfqs/RfqsPanel";
import { SellSidePanel as SellSidePanelComponent } from "#/ui/credit/sellSide/SellSidePanel";
import { TradeTicket as TradeTicketComponent } from "#/ui/credit/sellSide/TradeTicket";
import { AnalyticsHead as AnalyticsHeadComponent } from "#/ui/fx/analytics/AnalyticsHead";
import { AnalyticsPanel as AnalyticsPanelComponent } from "#/ui/fx/analytics/AnalyticsPanel";
import { PairPnlBars as PairPnlBarsComponent } from "#/ui/fx/analytics/PairPnlBars";
import { PnlChart as PnlChartComponent } from "#/ui/fx/analytics/PnlChart";
import { PnlValue as PnlValueComponent } from "#/ui/fx/analytics/PnlValue";
import { BlotterHeader as BlotterHeaderComponent } from "#/ui/fx/blotter/BlotterHeader";
import { BlotterRow as BlotterRowComponent } from "#/ui/fx/blotter/BlotterRow";
import { COLUMNS, formatFxCell } from "#/ui/fx/blotter/blotterColumns";
import { DateFilter as DateFilterComponent } from "#/ui/fx/blotter/columnFilter/DateFilter";
import { NumberFilter as NumberFilterComponent } from "#/ui/fx/blotter/columnFilter/NumberFilter";
import { SetFilter as SetFilterComponent } from "#/ui/fx/blotter/columnFilter/SetFilter";
import { FxBlotter as FxBlotterComponent } from "#/ui/fx/blotter/FxBlotter";
import { FxBlotterHead as FxBlotterHeadComponent } from "#/ui/fx/blotter/FxBlotterHead";
import { QuickFilter as QuickFilterComponent } from "#/ui/fx/blotter/QuickFilter";
import { CurrencyFilter as CurrencyFilterComponent } from "#/ui/fx/liveRates/CurrencyFilter";
import { LiveRatesHead as LiveRatesHeadComponent } from "#/ui/fx/liveRates/LiveRatesHead";
import { LiveRatesPanel as LiveRatesPanelComponent } from "#/ui/fx/liveRates/LiveRatesPanel";
import { RfqCountdown as RfqCountdownComponent } from "#/ui/fx/liveRates/tile/RfqCountdown";
import { SpreadDisplay as SpreadDisplayComponent } from "#/ui/fx/liveRates/tile/SpreadDisplay";
import { Tile as TileComponent } from "#/ui/fx/liveRates/tile/Tile";
import { TileConfirmation as TileConfirmationComponent } from "#/ui/fx/liveRates/tile/TileConfirmation";
import { TileFooter as TileFooterComponent } from "#/ui/fx/liveRates/tile/TileFooter";
import { TileHeader as TileHeaderComponent } from "#/ui/fx/liveRates/tile/TileHeader";
import { TileNotional as TileNotionalComponent } from "#/ui/fx/liveRates/tile/TileNotional";
import { TilePrice as TilePriceComponent } from "#/ui/fx/liveRates/tile/TilePrice";
import {
  TileRfq as TileRfqComponent,
  type TileRfqState,
} from "#/ui/fx/liveRates/tile/TileRfq";
import { PositionsHead as PositionsHeadComponent } from "#/ui/fx/positions/PositionsHead";
import { PositionsPanel as PositionsPanelComponent } from "#/ui/fx/positions/PositionsPanel";
import { AmbientBackground as AmbientBackgroundComponent } from "#/ui/shell/background/AmbientBackground";
import { BootGate as BootGateComponent } from "#/ui/shell/boot/BootGate";
import { BootSequence as BootSequenceComponent } from "#/ui/shell/boot/BootSequence";
import {
  HeaderChrome as HeaderChromeComponent,
  type WorkspaceTab,
} from "#/ui/shell/chrome/HeaderChrome";
import { ThemePicker as ThemePickerComponent } from "#/ui/shell/chrome/ThemePicker";
import { ConnectionOverlay as ConnectionOverlayComponent } from "#/ui/shell/connection/ConnectionOverlay";
import { ConnectionStatusBar as ConnectionStatusBarComponent } from "#/ui/shell/connection/ConnectionStatusBar";
import { LockScreen as LockScreenComponent } from "#/ui/shell/lock/LockScreen";
import { PreferencesModal as PreferencesModalComponent } from "#/ui/shell/prefs/PreferencesModal";
import { StaleIndicator as StaleIndicatorComponent } from "#/ui/shell/stale/StaleIndicator";
import { StatusBar as StatusBarComponent } from "#/ui/shell/status/StatusBar";
import { ThemeToggle as ThemeToggleComponent } from "#/ui/shell/theme/ThemeToggle";

import { AnimationProbe as AnimationProbeComponent } from "./AnimationProbe";
import { LayoutEngineHost } from "./LayoutEngineHost";

function noopFilter(_f: ColumnFilter | null): void {}

/** The plain (non-Accessor) machine-bundle shapes the framework-neutral
 * specs pass as props — see the ElementFor doc comment below. */
type NotionalLike = { state: NotionalView } & NotionalIntents;
type RfqStateLike = { state: RfqState } & RfqTileIntents;

type AnyToken = ComponentToken<unknown, MountedComponent<unknown>>;
/** token → Solid element builder. Receives the props ACCESSOR (not a
 * resolved snapshot) — see PropsHost.tsx's doc comment for why every field
 * read below is a call (`p().foo`), not a destructure: Solid components run
 * their setup body once, so only a call expression inside the JSX attribute
 * position stays reactive across a later `setProps`. Identity-keyed; no
 * string keys (mirrors the react registry).
 *
 * FX machine-bundle props (TileNotional's `notional`, TileConfirmation's
 * `state`, TileRfq's `rfqState`) are framework-neutral in the specs — a
 * PLAIN `{state: {...}, ...intents}` object (see e.g. TileNotionalPage's
 * `NotionalLike`), not Solid's `{state: Accessor<...>} & Intents` shape the
 * real app wires. Each such entry below wraps the plain `state` field in a
 * thunk (`() => (p().x as XLike).state`) so the ported component's
 * `props.x.state()` call keeps reading the CURRENT props value (mirrors the
 * ThemeProvider/LayoutEngine precedent of reading `p()` fresh per call,
 * never destructuring it once).
 */
type ElementFor = (props: Accessor<Record<string, unknown>>) => JSX.Element;

/**
 * Entries for every shell/layout/FX component ported to `@rtc/client-solid`
 * so far (Phase 2 Tasks 9-13). Credit/Equities/Admin tokens land with their
 * own Tasks (14-16) — mounting one of those today throws from render.tsx's
 * "no registry entry" branch, which doubles as the "not ported yet" signal:
 * `ComponentToken` is deliberately identity-keyed with no name field (see the
 * react registry's own comment), so there is no token label to embed in a
 * more specific message.
 */
export const registry = new Map<AnyToken, ElementFor>([
  [
    AnimationProbe,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <AnimationProbeComponent
          target={(p().target as string) ?? "tile:EURUSD"}
        />
      );
    },
  ],
  [
    BootSequence,
    (): JSX.Element => {
      return <BootSequenceComponent onDone={(): void => {}} />;
    },
  ],
  [
    BootGate,
    (): JSX.Element => {
      return (
        <BootGateComponent>
          <div data-testid="boot-gate-child" />
        </BootGateComponent>
      );
    },
  ],
  [
    AnalyticsPanel,
    (): JSX.Element => {
      return <AnalyticsPanelComponent />;
    },
  ],
  [
    AnalyticsHead,
    (): JSX.Element => {
      return <AnalyticsHeadComponent />;
    },
  ],
  [
    PnlValue,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return <PnlValueComponent value={p().value as number} />;
    },
  ],
  [
    PairPnlBars,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <PairPnlBarsComponent
          positions={(p().positions as readonly CurrencyPairPosition[]) ?? []}
        />
      );
    },
  ],
  [
    PnlChart,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <PnlChartComponent
          history={(p().history as readonly HistoricPosition[]) ?? []}
        />
      );
    },
  ],
  [
    PositionsPanel,
    (): JSX.Element => {
      return <PositionsPanelComponent />;
    },
  ],
  [
    PositionsHead,
    (): JSX.Element => {
      return <PositionsHeadComponent />;
    },
  ],
  [
    ConnectionStatusBar,
    (): JSX.Element => {
      return <ConnectionStatusBarComponent />;
    },
  ],
  [
    ConnectionOverlay,
    (): JSX.Element => {
      return <ConnectionOverlayComponent />;
    },
  ],
  [
    StatusBar,
    (): JSX.Element => {
      return <StatusBarComponent />;
    },
  ],
  [
    FxBlotter,
    (): JSX.Element => {
      return <FxBlotterComponent />;
    },
  ],
  [
    FxBlotterWorkspace,
    (): JSX.Element => {
      return (
        <>
          <FxBlotterHeadComponent />
          <FxBlotterComponent />
        </>
      );
    },
  ],
  [
    QuickFilter,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <QuickFilterComponent
          value={(p().value as string) ?? ""}
          onChange={(p().onChange as (v: string) => void) ?? ((): void => {})}
        />
      );
    },
  ],
  [
    BlotterRow,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <table>
          <tbody>
            <BlotterRowComponent
              trade={p().trade as Trade}
              isNew={(p().isNew as boolean) ?? false}
              columns={COLUMNS}
              format={formatFxCell}
            />
          </tbody>
        </table>
      );
    },
  ],
  [
    BlotterHeader,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <table>
          <thead>
            <BlotterHeaderComponent
              sort={
                (p().sort as SortState<Trade>) ?? {
                  column: null,
                  direction: null,
                }
              }
              onSort={
                (p().onSort as (c: keyof Trade) => void) ?? ((): void => {})
              }
              filters={
                (p().filters as Map<keyof Trade, ColumnFilter<Trade>>) ??
                new Map()
              }
              onFilter={
                (p().onFilter as (
                  c: keyof Trade,
                  f: ColumnFilter<Trade> | null,
                ) => void) ?? ((): void => {})
              }
              rows={
                (p().rows as readonly Trade[]) ??
                (p().trades as readonly Trade[]) ??
                []
              }
              columns={COLUMNS}
            />
          </thead>
        </table>
      );
    },
  ],
  [
    SetFilter,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <SetFilterComponent<Trade>
          column={(p().column as keyof Trade) ?? "currencyPair"}
          rows={
            (p().rows as readonly Trade[]) ??
            (p().trades as readonly Trade[]) ??
            []
          }
          currentFilter={p().currentFilter as ColumnFilter<Trade> | undefined}
          onApply={
            (p().onApply as (f: ColumnFilter<Trade> | null) => void) ??
            noopFilter
          }
        />
      );
    },
  ],
  [
    NumberFilter,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <NumberFilterComponent<Trade>
          column={(p().column as keyof Trade) ?? "notional"}
          currentFilter={p().currentFilter as ColumnFilter<Trade> | undefined}
          onApply={
            (p().onApply as (f: ColumnFilter<Trade> | null) => void) ??
            noopFilter
          }
        />
      );
    },
  ],
  [
    DateFilter,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <DateFilterComponent<Trade>
          column={(p().column as keyof Trade) ?? "tradeDate"}
          currentFilter={p().currentFilter as ColumnFilter<Trade> | undefined}
          onApply={
            (p().onApply as (f: ColumnFilter<Trade> | null) => void) ??
            noopFilter
          }
        />
      );
    },
  ],
  [
    NewRfqPanel,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <NewRfqPanelComponent
          onCreated={
            (p().onCreated as (id: number) => void) ?? ((): void => {})
          }
        />
      );
    },
  ],
  [
    NewRfqHead,
    (): JSX.Element => {
      return <NewRfqHeadComponent />;
    },
  ],
  [
    RfqsPanel,
    (): JSX.Element => {
      return <RfqsPanelComponent />;
    },
  ],
  [
    RfqsHead,
    (): JSX.Element => {
      return <RfqsHeadComponent />;
    },
  ],
  [
    RfqFilterPills,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <RfqFilterPillsComponent
          filter={(p().filter as CreditRfqFilter) ?? "live"}
          liveCount={(p().liveCount as string) ?? ""}
          onFilter={
            (p().onFilter as (f: CreditRfqFilter) => void) ?? ((): void => {})
          }
        />
      );
    },
  ],
  [
    SellSidePanel,
    (): JSX.Element => {
      return <SellSidePanelComponent />;
    },
  ],
  [
    TradeTicket,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <TradeTicketComponent
          rfq={p().rfq as Rfq}
          quote={p().quote as Quote}
          instrument={p().instrument as Instrument | undefined}
        />
      );
    },
  ],
  [
    CreditBlotter,
    (): JSX.Element => {
      return <CreditBlotterComponent />;
    },
  ],
  [
    CreditBlotterHead,
    (): JSX.Element => {
      return <CreditBlotterHeadComponent />;
    },
  ],
  [
    CreditBlotterWorkspace,
    (): JSX.Element => {
      return (
        <>
          <CreditBlotterHeadComponent />
          <CreditBlotterComponent />
        </>
      );
    },
  ],
  [
    LiveRatesPanel,
    (): JSX.Element => {
      return <LiveRatesPanelComponent />;
    },
  ],
  [
    CurrencyFilter,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <CurrencyFilterComponent
          selected={(p().selected as CurrencyCategory) ?? "All"}
          onChange={
            (p().onChange as (c: CurrencyCategory) => void) ?? ((): void => {})
          }
        />
      );
    },
  ],
  [
    LiveRatesWorkspace,
    (): JSX.Element => {
      return (
        <>
          <LiveRatesHeadComponent />
          <LiveRatesPanelComponent />
        </>
      );
    },
  ],
  [
    Tile,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <TileComponent
          pair={p().pair as CurrencyPair}
          showChart={(p().showChart as boolean) ?? false}
        />
      );
    },
  ],
  [
    TileHeader,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <TileHeaderComponent
          base={p().base as string}
          terms={p().terms as string}
          symbol={(p().symbol as string) ?? ""}
          movement={(p().movement as PriceMovementType) ?? "NONE"}
          movementPips={
            p().movementPips === undefined
              ? 0
              : (p().movementPips as number | null)
          }
          onInitiateRfq={p().onInitiateRfq as (() => void) | undefined}
        />
      );
    },
  ],
  [
    TilePrice,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <TilePriceComponent
          price={p().price as Price}
          ratePrecision={p().ratePrecision as number}
          pipsPosition={p().pipsPosition as number}
          anim={p().anim as "tickUp" | "tickDown" | undefined}
          spread={(p().spread as string) ?? ""}
          onExecute={
            (p().onExecute as (d: Direction) => void) ?? ((): void => {})
          }
          disabled={(p().disabled as boolean) ?? false}
        />
      );
    },
  ],
  [
    SpreadDisplay,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return <SpreadDisplayComponent spread={p().spread as string} />;
    },
  ],
  [
    TileFooter,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <TileFooterComponent
          spotDate={(p().spotDate as string) ?? ""}
          notional={(p().notional as string) ?? ""}
          baseCurrency={(p().baseCurrency as string) ?? ""}
        />
      );
    },
  ],
  [
    TileNotional,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <TileNotionalComponent
          notional={{
            state: () => {
              return (p().notional as NotionalLike).state;
            },
            change: (input: string) => {
              (p().notional as NotionalIntents).change(input);
            },
            reset: () => {
              (p().notional as NotionalIntents).reset();
            },
          }}
          baseCurrency={p().baseCurrency as string}
          disabled={p().disabled as boolean | undefined}
        />
      );
    },
  ],
  [
    TileConfirmation,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <TileConfirmationComponent
          state={() => {
            return p().state as TileExecutionState;
          }}
          onDismiss={(p().onDismiss as () => void) ?? ((): void => {})}
        />
      );
    },
  ],
  [
    RfqCountdown,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <RfqCountdownComponent
          remainingMs={p().remainingMs as number}
          totalMs={p().totalMs as number}
        />
      );
    },
  ],
  [
    TileRfq,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      const rfqState: TileRfqState = {
        state: () => {
          return (p().rfqState as RfqStateLike).state;
        },
        requestQuote: () => {
          (p().rfqState as RfqTileIntents).requestQuote();
        },
        cancel: () => {
          (p().rfqState as RfqTileIntents).cancel();
        },
        reject: () => {
          (p().rfqState as RfqTileIntents).reject();
        },
        accept: () => {
          (p().rfqState as RfqTileIntents).accept();
        },
      };

      return (
        <TileRfqComponent
          pair={p().pair as CurrencyPair}
          rfqState={rfqState}
          onExecute={
            (p().onExecute as (
              direction: Direction,
              price: Price,
              notional: number,
            ) => void) ?? ((): void => {})
          }
          notional={(p().notional as number) ?? 0}
        />
      );
    },
  ],
  [
    HeaderChrome,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <HeaderChromeComponent
          activeTab={(p().activeTab as WorkspaceTab) ?? "fx"}
          onTabChange={
            (p().onTabChange as (t: WorkspaceTab) => void) ?? ((): void => {})
          }
        />
      );
    },
  ],
  [
    ThemePicker,
    (): JSX.Element => {
      return <ThemePickerComponent />;
    },
  ],
  [
    StaleIndicator,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <StaleIndicatorComponent stale={(p().stale as boolean) ?? false}>
          <span>{(p().childLabel as string) ?? "content"}</span>
        </StaleIndicatorComponent>
      );
    },
  ],
  [
    ThemeToggle,
    (): JSX.Element => {
      return <ThemeToggleComponent />;
    },
  ],
  [
    LayoutEngine,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      const customHeadPanelIds =
        (p().customHeadPanelIds as readonly string[] | undefined) ?? [];
      const headRegistry: Partial<Record<PanelId, () => JSX.Element>> = {};

      for (const id of customHeadPanelIds) {
        headRegistry[id] = (): JSX.Element => {
          return <span data-testid="custom-head">Custom head for {id}</span>;
        };
      }

      return (
        <LayoutEngineHost
          headRegistry={headRegistry}
          pinnedFixture={(p().pinnedFixture as boolean | undefined) ?? false}
        />
      );
    },
  ],
  [
    LockScreen,
    (): JSX.Element => {
      return <LockScreenComponent />;
    },
  ],
  [
    AmbientBackground,
    (): JSX.Element => {
      return <AmbientBackgroundComponent />;
    },
  ],
  [
    PreferencesModal,
    (p: Accessor<Record<string, unknown>>): JSX.Element => {
      return (
        <PreferencesModalComponent
          open={(p().open as boolean) ?? false}
          onClose={(p().onClose as () => void) ?? ((): void => {})}
        />
      );
    },
  ],
]);
