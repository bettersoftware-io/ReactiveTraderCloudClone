import type { AppCommands, MachineFactories, Presenters } from "@rtc/core-api";

import type { Suite } from "#/harness/harness";
import { describeAmbientStyleContract } from "#/suites/ambientStyle";
import { describeAnalyticsContract } from "#/suites/analytics";
import { describeAnalyticsStaleFlagContract } from "#/suites/analyticsStaleFlag";
import { describeAnimatedBackgroundContract } from "#/suites/animatedBackground";
import { describeBlotterContract } from "#/suites/blotter";
import { describeBootPreferenceContract } from "#/suites/bootPreference";
import { describeChartSubstrateContract } from "#/suites/chartSubstrate";
import { describeConnectionContract } from "#/suites/connection";
import { describeCreditRfqFilterPreferenceContract } from "#/suites/creditRfqFilterPreference";
import { describeCurrencyPairsContract } from "#/suites/currencyPairs";
import { describeDealersContract } from "#/suites/dealers";
import { describeEqBlotterViewPreferenceContract } from "#/suites/eqBlotterViewPreference";
import { describeEqWatchlistSortPreferenceContract } from "#/suites/eqWatchlistSortPreference";
import { describeExecutionContract } from "#/suites/execution";
import { describeForceBootAnimationContract } from "#/suites/forceBootAnimation";
import { describeInstrumentsContract } from "#/suites/instruments";
import { describeJarvisPreferencesContract } from "#/suites/jarvisPreferences";
import { describeLayoutEngineContract } from "#/suites/layoutEngine";
import { describeLoginWaitPreferencesContract } from "#/suites/loginWaitPreferences";
import { describeNotionalContract } from "#/suites/notional";
import { describePowerSaverContract } from "#/suites/powerSaver";
import { describePriceHistoryContract } from "#/suites/priceHistory";
import { describePriceStreamContract } from "#/suites/priceStream";
import { describeReconnectContract } from "#/suites/reconnect";
import { describeRfqCountdownContract } from "#/suites/rfqCountdown";
import { describeRfqQuoteContract } from "#/suites/rfqQuote";
import { describeRfqSubmissionContract } from "#/suites/rfqSubmission";
import { describeRfqsContract } from "#/suites/rfqs";
import { describeRfqTileContract } from "#/suites/rfqTile";
import { describeRowHighlightContract } from "#/suites/rowHighlight";
import { describeStaleFlagContract } from "#/suites/staleFlag";
import { describeThemePreferenceContract } from "#/suites/themePreference";
import { describeThemeSkinPreferenceContract } from "#/suites/themeSkinPreference";
import { describeTicketSubmissionContract } from "#/suites/ticketSubmission";
import { describeTileExecutionContract } from "#/suites/tileExecution";
import { describeViewModePreferenceContract } from "#/suites/viewModePreference";

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
  "presenters.throughput": null,
  "presenters.themePreference": describeThemePreferenceContract,
  "presenters.themeSkinPreference": describeThemeSkinPreferenceContract,
  "presenters.animatedBackground": describeAnimatedBackgroundContract,
  "presenters.ambientStyle": describeAmbientStyleContract,
  "presenters.chartSubstrate": describeChartSubstrateContract,
  "presenters.layoutEngine": describeLayoutEngineContract,
  "presenters.dockLayoutStore": null,
  "presenters.forceBootAnimation": describeForceBootAnimationContract,
  "presenters.powerSaver": describePowerSaverContract,
  "presenters.viewModePreference": describeViewModePreferenceContract,
  "presenters.creditRfqFilterPreference":
    describeCreditRfqFilterPreferenceContract,
  "presenters.eqWatchlistSortPreference":
    describeEqWatchlistSortPreferenceContract,
  "presenters.eqBlotterViewPreference": describeEqBlotterViewPreferenceContract,
  "presenters.animationDirector": null,
  "presenters.bootPreference": describeBootPreferenceContract,
  "presenters.bootGate": null,
  "presenters.auth": null,
  "presenters.loginWaitPreferences": describeLoginWaitPreferencesContract,
  "presenters.jarvisPreferences": describeJarvisPreferencesContract,
  "presenters.watchlist": null,
  "presenters.candleSeries": null,
  "presenters.depth": null,
  "presenters.ordersBlotter": null,
  "presenters.positions": null,
  "presenters.incident": null,
  "presenters.eqWorkspace": null,
  "presenters.workspaceNav": null,
  "presenters.layoutFor": null,
  "presenters.eqDrawings": null,
  "presenters.throughputMetric": null,
  "presenters.latencyMetric": null,
  "presenters.errorRateMetric": null,
  "presenters.topology": null,
  "presenters.eventLog": null,
  "presenters.sessions": null,
  "presenters.sessionsKpi": null,
  "presenters.jarvis": null,
  "presenters.jarvisUsage": null,
  "presenters.jarvisPanels": null,
  "presenters.dockPanel": null,
  "presenters.dockedPanelIdsFor": null,
  "presenters.undockPanel": null,
  "presenters.dismissPanel": null,
  "presenters.resetWorkspaceLayout": null,
  "presenters.workspaceLayoutResets$": null,
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
  "machines.layout": null,
  "machines.boot": null,
  "machines.orderTicket": null,
  "commands.reconnect": describeReconnectContract,
  "commands.reportDetachedPanels": null,
};

/** Members whose suite is still to be written. Hand-maintained on purpose:
 * the drift test fails if this list and the `null`s above disagree, so a
 * member cannot silently lose its suite. Shrinks slice by slice. */
export const PENDING_SUITES: readonly ContractMember[] = [
  "presenters.throughput",
  "presenters.dockLayoutStore",
  "presenters.animationDirector",
  "presenters.bootGate",
  "presenters.auth",
  "presenters.watchlist",
  "presenters.candleSeries",
  "presenters.depth",
  "presenters.ordersBlotter",
  "presenters.positions",
  "presenters.incident",
  "presenters.eqWorkspace",
  "presenters.workspaceNav",
  "presenters.layoutFor",
  "presenters.eqDrawings",
  "presenters.throughputMetric",
  "presenters.latencyMetric",
  "presenters.errorRateMetric",
  "presenters.topology",
  "presenters.eventLog",
  "presenters.sessions",
  "presenters.sessionsKpi",
  "presenters.jarvis",
  "presenters.jarvisUsage",
  "presenters.jarvisPanels",
  "presenters.dockPanel",
  "presenters.dockedPanelIdsFor",
  "presenters.undockPanel",
  "presenters.dismissPanel",
  "presenters.resetWorkspaceLayout",
  "presenters.workspaceLayoutResets$",
  "presenters.jarvisDriver",
  "presenters.jarvisDemo",
  "machines.layout",
  "machines.boot",
  "machines.orderTicket",
  "commands.reportDetachedPanels",
];
