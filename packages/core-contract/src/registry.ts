import type { AppCommands, MachineFactories, Presenters } from "@rtc/core-api";

import type { Suite } from "#/harness/harness";
import { describeAmbientStyleContract } from "#/suites/ambientStyle";
import { describeAnalyticsContract } from "#/suites/analytics";
import { describeAnalyticsStaleFlagContract } from "#/suites/analyticsStaleFlag";
import { describeAnimatedBackgroundContract } from "#/suites/animatedBackground";
import { describeAnimationDirectorContract } from "#/suites/animationDirector";
import { describeAuthContract } from "#/suites/auth";
import { describeBlotterContract } from "#/suites/blotter";
import { describeBootContract } from "#/suites/boot";
import { describeBootGateContract } from "#/suites/bootGate";
import { describeBootPreferenceContract } from "#/suites/bootPreference";
import { describeCandleSeriesContract } from "#/suites/candleSeries";
import { describeChartSubstrateContract } from "#/suites/chartSubstrate";
import { describeConnectionContract } from "#/suites/connection";
import { describeCreditRfqFilterPreferenceContract } from "#/suites/creditRfqFilterPreference";
import { describeCurrencyPairsContract } from "#/suites/currencyPairs";
import { describeDealersContract } from "#/suites/dealers";
import { describeDepthContract } from "#/suites/depth";
import {
  describeDismissPanelContract,
  describeDockedPanelIdsForContract,
  describeDockPanelContract,
  describeUndockPanelContract,
} from "#/suites/dock";
import { describeEqBlotterViewPreferenceContract } from "#/suites/eqBlotterViewPreference";
import { describeEqDrawingsContract } from "#/suites/eqDrawings";
import { describeEqWatchlistSortPreferenceContract } from "#/suites/eqWatchlistSortPreference";
import { describeEqWorkspaceContract } from "#/suites/eqWorkspace";
import { describeEventLogContract } from "#/suites/eventLog";
import { describeExecutionContract } from "#/suites/execution";
import { describeForceBootAnimationContract } from "#/suites/forceBootAnimation";
import { describeIncidentContract } from "#/suites/incident";
import { describeInstrumentsContract } from "#/suites/instruments";
import { describeJarvisPanelsContract } from "#/suites/jarvisPanels";
import { describeJarvisPreferencesContract } from "#/suites/jarvisPreferences";
import {
  describeLayoutForContract,
  describeMachinesLayoutContract,
} from "#/suites/layout";
import { describeLayoutEngineContract } from "#/suites/layoutEngine";
import { describeLayoutPresetsContract } from "#/suites/layoutPresets";
import { describeLoginWaitPreferencesContract } from "#/suites/loginWaitPreferences";
import {
  describeErrorRateMetricContract,
  describeLatencyMetricContract,
  describeThroughputMetricContract,
} from "#/suites/metricWindows";
import { describeNotionalContract } from "#/suites/notional";
import { describeOrdersBlotterContract } from "#/suites/ordersBlotter";
import { describeOrderTicketContract } from "#/suites/orderTicket";
import { describePositionsContract } from "#/suites/positions";
import { describePowerSaverContract } from "#/suites/powerSaver";
import { describePriceHistoryContract } from "#/suites/priceHistory";
import { describePriceStreamContract } from "#/suites/priceStream";
import { describeReconnectContract } from "#/suites/reconnect";
import { describeReportDetachedPanelsContract } from "#/suites/reportDetachedPanels";
import {
  describeDockLayoutStoreContract,
  describeResetWorkspaceLayoutContract,
  describeWorkspaceLayoutResetsContract,
} from "#/suites/reset";
import { describeRfqCountdownContract } from "#/suites/rfqCountdown";
import { describeRfqQuoteContract } from "#/suites/rfqQuote";
import { describeRfqSubmissionContract } from "#/suites/rfqSubmission";
import { describeRfqsContract } from "#/suites/rfqs";
import { describeRfqTileContract } from "#/suites/rfqTile";
import { describeRowHighlightContract } from "#/suites/rowHighlight";
import { describeSessionsContract } from "#/suites/sessions";
import { describeSessionsKpiContract } from "#/suites/sessionsKpi";
import { describeStaleFlagContract } from "#/suites/staleFlag";
import { describeThemePreferenceContract } from "#/suites/themePreference";
import { describeThemeSkinPreferenceContract } from "#/suites/themeSkinPreference";
import { describeThroughputContract } from "#/suites/throughput";
import { describeTicketSubmissionContract } from "#/suites/ticketSubmission";
import { describeTileExecutionContract } from "#/suites/tileExecution";
import { describeTopologyContract } from "#/suites/topology";
import { describeViewModePreferenceContract } from "#/suites/viewModePreference";
import { describeWatchlistContract } from "#/suites/watchlist";
import { describeWorkspaceNavContract } from "#/suites/workspaceNav";

type PresenterMember = `presenters.${keyof Presenters & string}`;
type MachineMember = `machines.${keyof MachineFactories & string}`;
type CommandMember = `commands.${keyof AppCommands & string}`;

/** Every member of the core contract, by dotted path. */
export type ContractMember = PresenterMember | MachineMember | CommandMember;

/** The exhaustive registry: adding a member to `Presenters` or
 * `MachineFactories` is a compile error here until it is listed — with a
 * suite, or `null` while it is pending (then it must also appear in
 * `PENDING_SUITES`, which `registry.test.ts` enforces). */
export const CONTRACT_SUITES: Record<ContractMember, Suite | null> = {
  "presenters.priceStream": describePriceStreamContract,
  "presenters.priceHistory": describePriceHistoryContract,
  "presenters.execution": describeExecutionContract,
  "presenters.blotter": describeBlotterContract,
  "presenters.analytics": describeAnalyticsContract,
  "presenters.rfqs": describeRfqsContract,
  "presenters.currencyPairs": describeCurrencyPairsContract,
  "presenters.instruments": describeInstrumentsContract,
  "presenters.dealers": describeDealersContract,
  "presenters.connection": describeConnectionContract,
  "presenters.rfqQuote": describeRfqQuoteContract,
  "presenters.throughput": describeThroughputContract,
  "presenters.themePreference": describeThemePreferenceContract,
  "presenters.themeSkinPreference": describeThemeSkinPreferenceContract,
  "presenters.animatedBackground": describeAnimatedBackgroundContract,
  "presenters.ambientStyle": describeAmbientStyleContract,
  "presenters.chartSubstrate": describeChartSubstrateContract,
  "presenters.layoutEngine": describeLayoutEngineContract,
  "presenters.dockLayoutStore": describeDockLayoutStoreContract,
  "presenters.forceBootAnimation": describeForceBootAnimationContract,
  "presenters.powerSaver": describePowerSaverContract,
  "presenters.viewModePreference": describeViewModePreferenceContract,
  "presenters.creditRfqFilterPreference":
    describeCreditRfqFilterPreferenceContract,
  "presenters.eqWatchlistSortPreference":
    describeEqWatchlistSortPreferenceContract,
  "presenters.eqBlotterViewPreference": describeEqBlotterViewPreferenceContract,
  "presenters.animationDirector": describeAnimationDirectorContract,
  "presenters.bootPreference": describeBootPreferenceContract,
  "presenters.bootGate": describeBootGateContract,
  "presenters.auth": describeAuthContract,
  "presenters.loginWaitPreferences": describeLoginWaitPreferencesContract,
  "presenters.jarvisPreferences": describeJarvisPreferencesContract,
  "presenters.watchlist": describeWatchlistContract,
  "presenters.candleSeries": describeCandleSeriesContract,
  "presenters.depth": describeDepthContract,
  "presenters.ordersBlotter": describeOrdersBlotterContract,
  "presenters.positions": describePositionsContract,
  "presenters.incident": describeIncidentContract,
  "presenters.eqWorkspace": describeEqWorkspaceContract,
  "presenters.workspaceNav": describeWorkspaceNavContract,
  "presenters.layoutFor": describeLayoutForContract,
  "presenters.eqDrawings": describeEqDrawingsContract,
  "presenters.throughputMetric": describeThroughputMetricContract,
  "presenters.latencyMetric": describeLatencyMetricContract,
  "presenters.errorRateMetric": describeErrorRateMetricContract,
  "presenters.topology": describeTopologyContract,
  "presenters.eventLog": describeEventLogContract,
  "presenters.sessions": describeSessionsContract,
  "presenters.sessionsKpi": describeSessionsKpiContract,
  "presenters.jarvis": null,
  "presenters.jarvisUsage": null,
  "presenters.jarvisPanels": describeJarvisPanelsContract,
  "presenters.dockPanel": describeDockPanelContract,
  "presenters.dockedPanelIdsFor": describeDockedPanelIdsForContract,
  "presenters.undockPanel": describeUndockPanelContract,
  "presenters.dismissPanel": describeDismissPanelContract,
  "presenters.resetWorkspaceLayout": describeResetWorkspaceLayoutContract,
  "presenters.workspaceLayoutResets$": describeWorkspaceLayoutResetsContract,
  "presenters.layoutPresets": describeLayoutPresetsContract,
  "presenters.jarvisDriver": null,
  "presenters.jarvisDemo": null,
  "machines.tileExecution": describeTileExecutionContract,
  "machines.rfqTile": describeRfqTileContract,
  "machines.staleFlag": describeStaleFlagContract,
  "machines.analyticsStaleFlag": describeAnalyticsStaleFlagContract,
  "machines.rowHighlight": describeRowHighlightContract,
  "machines.notional": describeNotionalContract,
  "machines.rfqSubmission": describeRfqSubmissionContract,
  "machines.ticketSubmission": describeTicketSubmissionContract,
  "machines.rfqCountdown": describeRfqCountdownContract,
  "machines.layout": describeMachinesLayoutContract,
  "machines.boot": describeBootContract,
  "machines.orderTicket": describeOrderTicketContract,
  "commands.reconnect": describeReconnectContract,
  "commands.reportDetachedPanels": describeReportDetachedPanelsContract,
};

/** Members whose suite is still to be written. Hand-maintained on purpose:
 * the drift test fails if this list and the `null`s above disagree, so a
 * member cannot silently lose its suite. Shrinks slice by slice. */
export const PENDING_SUITES: readonly ContractMember[] = [
  "presenters.jarvis",
  "presenters.jarvisUsage",
  "presenters.jarvisDriver",
  "presenters.jarvisDemo",
];
