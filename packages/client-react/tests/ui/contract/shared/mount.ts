import { BehaviorSubject } from "rxjs";

import type {
  AnimationIntent,
  IncidentKind,
  SessionState,
  ThroughputView,
} from "@rtc/client-core";
import type {
  CreditRfqFilter,
  EquityOrder,
  LogEvent,
  MetricSample,
  Price,
  PriceTick,
  Quote,
  ServiceTopology,
  SessionInfo,
  ThemeModePreference,
  ThemeSkin,
  ViewMode,
} from "@rtc/domain";

import { getDriver, type MountedRoot } from "./harness/activeDriver";
import type {
  ComponentToken,
  MountedComponent,
  PageContext,
} from "./harness/component";
import {
  type AdminSeed,
  type CommandResults,
  createWorld,
  type EquitiesSeed,
  type HookValues,
  type MetricsView,
  type ParametricSeed,
  type World,
} from "./harness/world";

export interface MountOptions<P> {
  props?: P;
  hooks?: Partial<HookValues>;
  commands?: CommandResults;
  /** Seed values for parametric query hooks (usePrice / usePriceHistory). */
  parametric?: ParametricSeed;
  /** Seed the initial throughput view (useThroughput). */
  throughput?: Partial<ThroughputView>;
  /** Seed the initial theme-mode preference (useThemePreference); defaults to DEFAULT_THEME_MODE. */
  themeMode?: ThemeModePreference;
  /** Seed the initial theme-skin preference (useThemeSkinPreference); defaults to "classic". */
  themeSkin?: ThemeSkin;
  /** Seed the initial animated-background preference (useAnimatedBackground); defaults to false. */
  animatedBackground?: boolean;
  /** Seed the initial view-mode preference (useViewModePreference); defaults to DEFAULT_VIEW_MODE. */
  viewMode?: ViewMode;
  /** Seed the initial session state (useSession); defaults to unlocked + demo user. */
  session?: Partial<SessionState>;
  /** Seed the equities streams (useWatchlist / useEquityQuote / useEquityOrders / …). */
  equities?: EquitiesSeed;
  /** Seed the admin / telemetry streams (useTopology / useEventLog / useSessions / useMetrics). */
  admin?: AdminSeed;
  /** Seed the initial Credit RFQs filter preference (useCreditRfqFilterPreference); defaults to DEFAULT_CREDIT_RFQ_FILTER. */
  creditRfqFilter?: CreditRfqFilter;
}

const mounted: MountedRoot[] = [];

/** Build a PageContext wired to an existing World. Shared by mount() and mountWith(). */
function buildContext<P>(
  world: World,
  propsSubject: BehaviorSubject<Partial<P>>,
  rendered: MountedRoot,
): PageContext<P> {
  // Use the driver's flush hook (e.g. React `act`) if provided so that
  // synchronous BehaviorSubject mutations flush pending re-renders before
  // the caller's next assertion.
  const flush =
    rendered.flushSync ??
    ((fn: () => void): void => {
      fn();
    });

  return {
    root: rendered.root,
    setProps: (next: Partial<P>) => {
      return flush(() => {
        return propsSubject.next({ ...propsSubject.getValue(), ...next });
      });
    },
    emit: (patch: Partial<HookValues>) => {
      return flush(() => {
        return world.push(patch);
      });
    },
    setPrice: (symbol: string, value: Price | null) => {
      return flush(() => {
        return world.setPrice(symbol, value);
      });
    },
    setHistory: (symbol: string, value: readonly PriceTick[]) => {
      return flush(() => {
        return world.setHistory(symbol, value);
      });
    },
    setQuotesForRfq: (rfqId: number, value: readonly Quote[]) => {
      return flush(() => {
        return world.setQuotesForRfq(rfqId, value);
      });
    },
    setIntent: (target: string, intent: AnimationIntent | null) => {
      return flush(() => {
        return world.setIntent(target, intent);
      });
    },
    setThroughputView: (patch: Partial<ThroughputView>) => {
      return flush(() => {
        return world.setThroughputView(patch);
      });
    },
    pushOrderLifecycle: (order: EquityOrder) => {
      return flush(() => {
        return world.pushOrderLifecycle(order);
      });
    },
    throughputSets: world.throughputSets,
    commands: world.commands,
    // Admin / telemetry setters: flush-wrapped so React re-renders are flushed
    // synchronously before the next assertion (mirrors ctx.emit behaviour).
    setTopology: (value: ServiceTopology | null) => {
      return flush(() => {
        return world.setTopology(value);
      });
    },
    setEventLog: (value: readonly LogEvent[]) => {
      return flush(() => {
        return world.setEventLog(value);
      });
    },
    setSessions: (value: readonly SessionInfo[]) => {
      return flush(() => {
        return world.setSessions(value);
      });
    },
    setSessionCountSeries: (value: readonly MetricSample[]) => {
      return flush(() => {
        return world.setSessionCountSeries(value);
      });
    },
    setMetrics: (patch: Partial<MetricsView>) => {
      return flush(() => {
        return world.setMetrics(patch);
      });
    },
    injectIncident: (kind: IncidentKind) => {
      return flush(() => {
        return world.injectIncident(kind);
      });
    },
    clearIncident: () => {
      return flush(() => {
        return world.clearIncident();
      });
    },
    setCreditRfqFilter: (filter: CreditRfqFilter) => {
      return flush(() => {
        return world.setCreditRfqFilter(filter);
      });
    },
    setBootGateVisible: (visible: boolean) => {
      return flush(() => {
        return world.bootGate.next(visible);
      });
    },
  };
}

export function mount<P, Page extends MountedComponent<P>>(
  token: ComponentToken<P, Page>,
  opts: MountOptions<P> = {},
): Page {
  const world = createWorld(
    opts.hooks,
    opts.commands,
    opts.parametric,
    opts.throughput,
    opts.themeMode,
    opts.viewMode,
    opts.themeSkin,
    opts.animatedBackground,
    opts.session,
    opts.equities,
    opts.admin,
    opts.creditRfqFilter,
  );
  const propsSubject = new BehaviorSubject<Partial<P>>(opts.props ?? {});
  const rendered = getDriver().render(token, { propsSubject, world });
  mounted.push(rendered);
  return token.makePage(buildContext(world, propsSubject, rendered));
}

/**
 * Mount a component using a SHARED, pre-created World. Use this when two
 * components must react to the same World subjects (e.g. the incident→banner
 * coupling spec mounts IncidentControls and ConnectionOverlay on one World so
 * that injectIncident() drives both). Create the shared world with
 * {@link createWorld} before calling mountWith.
 */
export function mountWith<P, Page extends MountedComponent<P>>(
  world: World,
  token: ComponentToken<P, Page>,
  props: Partial<P> = {},
): Page {
  const propsSubject = new BehaviorSubject<Partial<P>>(props);
  const rendered = getDriver().render(token, { propsSubject, world });
  mounted.push(rendered);
  return token.makePage(buildContext(world, propsSubject, rendered));
}

/** Unmount everything mounted since the last cleanup (call in afterEach). */
export function cleanupMounted(): void {
  while (mounted.length > 0) {
    const entry = mounted.pop();
    if (entry) entry.unmount();
  }
}

// Re-export createWorld so specs can create a shared world directly via the
// mount-package alias (@ui-contract/mount) rather than the harness alias.
export { createWorld } from "./harness/world";
