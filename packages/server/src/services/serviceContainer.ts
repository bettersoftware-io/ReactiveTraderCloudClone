import {
  AnalyticsSimulator,
  CreditRfqSimulator,
  DEALERS_CATALOG,
  DealerSimulator,
  EquityMarketDataSimulator,
  EquityOrderSimulator,
  EquityPositionSimulator,
  ExecutionSimulator,
  type FillEvent,
  InstrumentSimulator,
  type MarketDataPort,
  type OrderPort,
  type PositionPort,
  PricingSimulator,
  ReferenceDataSimulator,
  type ServiceHealthPort,
  ServiceTopologySimulator,
  TradeStoreSimulator,
} from "@rtc/domain";

import type { AccountAdminService } from "../accounts/accountAdminService.js";
import { createInMemorySpendStore } from "./jarvisBudget/InMemorySpendStore.js";
import { JarvisBudgetService } from "./jarvisBudget/JarvisBudgetService.js";
import { parseJarvisBudgetConfig } from "./jarvisBudget/jarvisBudgetConfig.js";
import type { JarvisTier } from "./jarvisBudget/jarvisTier.js";
import type { SpendStore } from "./jarvisBudget/SpendStore.js";
import { OwnKeyCheckLimiter } from "./ownKey/OwnKeyCheckLimiter.js";
import { type VerifyOwnKey, verifyOwnKey } from "./ownKey/verifyOwnKey.js";
import { ThroughputService } from "./ThroughputService.js";
import { UsageMeter } from "./UsageMeter.js";

/** The verified identity behind one WebSocket connection. `accountId` is null
 * for a roster login; `issuedAt` is null for a roster token and for an
 * account token minted before B2c. */
export interface Caller {
  readonly username: string;
  readonly accountId: string | null;
  readonly issuedAt: number | null;
}

export interface ServiceContainer {
  readonly referenceData: ReferenceDataSimulator;
  readonly pricing: PricingSimulator;
  readonly execution: ExecutionSimulator;
  readonly blotter: TradeStoreSimulator;
  readonly analytics: AnalyticsSimulator;
  readonly serviceHealth: ServiceHealthPort;
  readonly instruments: InstrumentSimulator;
  readonly dealers: DealerSimulator;
  readonly workflow: CreditRfqSimulator;
  readonly throughput: ThroughputService;
  readonly marketData: MarketDataPort;
  readonly orders: OrderPort;
  readonly positions: PositionPort;
  /** Today's Jarvis usage for the Ops card — display only. */
  readonly usageMeter: UsageMeter;
  /** Each person's daily Jarvis spend on the house key, and the house cap. */
  readonly jarvisBudget: JarvisBudgetService;
  /** Which house offer and budget a caller gets. A connection asks once. */
  readonly jarvisTier: (caller: Caller) => Promise<JarvisTier>;
  /** Provider checks of people's own keys, per caller. One instance for the
   * process, so a reconnect does not reset a caller's allowance. */
  readonly ownKeyChecks: OwnKeyCheckLimiter;
  /** How a person's own key is checked with its provider. */
  readonly verifyOwnKey: VerifyOwnKey;
  /** Null on the shared container; set on a connection's scoped one. */
  readonly caller: Caller | null;
  /** The administrator rules behind the `admin.accounts.*` RPCs. */
  readonly accountAdmin: AccountAdminService;
}

/** The service of a container built without an account directory: every
 * call answers `unavailable`. */
function createUnavailableAccountAdminService(): AccountAdminService {
  return {
    list: () => {
      return Promise.resolve({ ok: false, refusal: "unavailable" });
    },
    act: () => {
      return Promise.resolve({ ok: false, refusal: "unavailable" });
    },
  };
}

/**
 * The tier lookup of a container built without an account directory: it
 * cannot read a role, so every account is a member and only the roster
 * persona (no account) is an operator — the narrower answer whenever the
 * role is unknown, as `createTierLookup` does on a directory failure.
 */
function readTierFromLoginKind(caller: Caller): Promise<JarvisTier> {
  return Promise.resolve(caller.accountId === null ? "operator" : "member");
}

/** What the composition root hands `createServices` beyond the env. Each
 * one has a default that needs nothing outside the process, so a test can
 * build a working container from `createServices({})` alone. */
export interface ServiceOptions {
  /** The administrator rules behind the `admin.accounts.*` RPCs; without
   * one every call answers `unavailable`. */
  readonly accountAdmin?: AccountAdminService;
  /** Where the daily Jarvis spend is kept; in memory when omitted. */
  readonly spendStore?: SpendStore;
  /** How a caller's tier is read; by login kind when omitted. */
  readonly jarvisTier?: (caller: Caller) => Promise<JarvisTier>;
  /** How an own key is checked; with its provider when omitted. */
  readonly verifyOwnKey?: VerifyOwnKey;
}

/**
 * `env` defaults to `process.env` — the real, ambient environment — so every
 * existing call site (`index.ts`, and the many tests that call
 * `createServices()` with no argument) keeps reading real process env with
 * no change. Parameterized (mirroring `createJarvisLoops`'s own
 * `env: NodeJS.ProcessEnv` parameter in `agentLoop.ts`) so a test that wants
 * a specific `RTC_JARVIS_*` budget config can pass one explicitly instead of
 * the whole suite becoming sensitive to whatever's set in the ambient
 * process env it happens to run under.
 */
export function createServices(
  env: NodeJS.ProcessEnv = process.env,
  options: ServiceOptions = {},
): ServiceContainer {
  const referenceData = new ReferenceDataSimulator();
  const pricing = new PricingSimulator();
  const execution = new ExecutionSimulator();
  const blotter = new TradeStoreSimulator(execution);
  const analytics = new AnalyticsSimulator();
  // Fixed dev seed (3) — mirrors how client-adapters's simulator composition
  // seeds the same class (see `createSimulatorPorts` in `portFactory.ts`).
  const serviceHealth = new ServiceTopologySimulator(3);
  const instruments = new InstrumentSimulator();
  const dealers = new DealerSimulator();
  const workflow = new CreditRfqSimulator(DEALERS_CATALOG);
  const throughput = new ThroughputService();
  const usageMeter = new UsageMeter();
  const jarvisBudget = new JarvisBudgetService({
    store: options.spendStore ?? createInMemorySpendStore(),
    config: parseJarvisBudgetConfig(env),
  });
  const marketData = new EquityMarketDataSimulator();
  const positions = new EquityPositionSimulator(marketData);
  const orders = new EquityOrderSimulator({
    listener: (fill: FillEvent): void => {
      positions.bookFill(fill);
    },
    markFor: (symbol: string): number => {
      return marketData.currentPrice(symbol);
    },
  });

  return {
    referenceData,
    pricing,
    execution,
    blotter,
    analytics,
    serviceHealth,
    instruments,
    dealers,
    workflow,
    throughput,
    marketData,
    orders,
    positions,
    usageMeter,
    jarvisBudget,
    jarvisTier: options.jarvisTier ?? readTierFromLoginKind,
    ownKeyChecks: new OwnKeyCheckLimiter(),
    verifyOwnKey: options.verifyOwnKey ?? verifyOwnKey,
    caller: null,
    accountAdmin:
      options.accountAdmin ?? createUnavailableAccountAdminService(),
  };
}
