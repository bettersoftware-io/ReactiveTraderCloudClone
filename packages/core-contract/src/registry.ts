import type { AppCommands, MachineFactories, Presenters } from "@rtc/core-api";

import type { Suite } from "#/harness/harness";
import { describeAmbientStyleContract } from "#/suites/ambientStyle";
import { describeAnimatedBackgroundContract } from "#/suites/animatedBackground";
import { describeBootPreferenceContract } from "#/suites/bootPreference";
import { describeChartSubstrateContract } from "#/suites/chartSubstrate";
import { describeConnectionContract } from "#/suites/connection";
import { describeCreditRfqFilterPreferenceContract } from "#/suites/creditRfqFilterPreference";
import { describeEqBlotterViewPreferenceContract } from "#/suites/eqBlotterViewPreference";
import { describeEqWatchlistSortPreferenceContract } from "#/suites/eqWatchlistSortPreference";
import { describeForceBootAnimationContract } from "#/suites/forceBootAnimation";
import { describeJarvisPreferencesContract } from "#/suites/jarvisPreferences";
import { describeLayoutEngineContract } from "#/suites/layoutEngine";
import { describeLoginWaitPreferencesContract } from "#/suites/loginWaitPreferences";
import { describePowerSaverContract } from "#/suites/powerSaver";
import { describeReconnectContract } from "#/suites/reconnect";
import { describeThemePreferenceContract } from "#/suites/themePreference";
import { describeThemeSkinPreferenceContract } from "#/suites/themeSkinPreference";
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
  "presenters.priceStream": null,
  "presenters.priceHistory": null,
  "presenters.execution": null,
  "presenters.blotter": null,
  "presenters.analytics": null,
  "presenters.rfqs": null,
  "presenters.currencyPairs": null,
  "presenters.instruments": null,
  "presenters.dealers": null,
  "presenters.connection": describeConnectionContract,
  "presenters.rfqQuote": null,
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
  "machines.tileExecution": null,
  "machines.rfqTile": null,
  "machines.staleFlag": null,
  "machines.analyticsStaleFlag": null,
  "machines.rowHighlight": null,
  "machines.notional": null,
  "machines.rfqSubmission": null,
  "machines.ticketSubmission": null,
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
  "presenters.priceStream",
  "presenters.priceHistory",
  "presenters.execution",
  "presenters.blotter",
  "presenters.analytics",
  "presenters.rfqs",
  "presenters.currencyPairs",
  "presenters.instruments",
  "presenters.dealers",
  "presenters.rfqQuote",
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
  "machines.tileExecution",
  "machines.rfqTile",
  "machines.staleFlag",
  "machines.analyticsStaleFlag",
  "machines.rowHighlight",
  "machines.notional",
  "machines.rfqSubmission",
  "machines.ticketSubmission",
  "machines.layout",
  "machines.boot",
  "machines.orderTicket",
  "commands.reportDetachedPanels",
];
