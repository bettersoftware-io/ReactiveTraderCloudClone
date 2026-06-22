import { BehaviorSubject } from "rxjs";

import type { Theme, ViewMode } from "@rtc/domain";

import type { ThroughputView } from "../../../../src/app/presenters/ThroughputPresenter";
import { getDriver, type MountedRoot } from "./harness/activeDriver";
import type {
  ComponentToken,
  MountedComponent,
  PageContext,
} from "./harness/component";
import {
  type CommandResults,
  createWorld,
  type HookValues,
  type ParametricSeed,
} from "./harness/world";

export interface MountOptions<P> {
  props?: P;
  hooks?: Partial<HookValues>;
  commands?: CommandResults;
  /** Seed values for parametric query hooks (usePrice / usePriceHistory). */
  parametric?: ParametricSeed;
  /** Seed the initial throughput view (useThroughput). */
  throughput?: Partial<ThroughputView>;
  /** Seed the initial theme preference (useThemePreference); defaults to DEFAULT_THEME. */
  theme?: Theme;
  /** Seed the initial view-mode preference (useViewModePreference); defaults to DEFAULT_VIEW_MODE. */
  viewMode?: ViewMode;
}

const mounted: MountedRoot[] = [];

export function mount<P, Page extends MountedComponent<P>>(
  token: ComponentToken<P, Page>,
  opts: MountOptions<P> = {},
): Page {
  const world = createWorld(
    opts.hooks,
    opts.commands,
    opts.parametric,
    opts.throughput,
    opts.theme,
    opts.viewMode,
  );
  const propsSubject = new BehaviorSubject<Partial<P>>(opts.props ?? {});
  const rendered = getDriver().render(token, { propsSubject, world });
  mounted.push(rendered);

  // Use the driver's flush hook (e.g. React `act`) if provided so that
  // synchronous BehaviorSubject mutations flush pending re-renders before
  // the caller's next assertion.
  const flush = rendered.flushSync ?? ((fn: () => void) => fn());

  const ctx: PageContext<P> = {
    root: rendered.root,
    setProps: (next) =>
      flush(() => propsSubject.next({ ...propsSubject.getValue(), ...next })),
    emit: (patch) => flush(() => world.push(patch)),
    setPrice: (symbol, value) => flush(() => world.setPrice(symbol, value)),
    setHistory: (symbol, value) => flush(() => world.setHistory(symbol, value)),
    setQuotesForRfq: (rfqId, value) =>
      flush(() => world.setQuotesForRfq(rfqId, value)),
    setThroughputView: (patch) => flush(() => world.setThroughputView(patch)),
    throughputSets: world.throughputSets,
    commands: world.commands,
  };
  return token.makePage(ctx);
}

/** Unmount everything mounted since the last cleanup (call in afterEach). */
export function cleanupMounted(): void {
  while (mounted.length > 0) {
    const entry = mounted.pop();
    if (entry) entry.unmount();
  }
}
