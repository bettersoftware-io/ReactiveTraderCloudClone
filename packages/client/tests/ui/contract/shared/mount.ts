import { BehaviorSubject } from "rxjs";
import {
  createWorld,
  type HookValues,
  type CommandResults,
  type ParametricSeed,
} from "./harness/world";
import {
  getDriver,
  type MountedRoot,
} from "./harness/activeDriver";
import type {
  ComponentToken,
  MountedComponent,
  PageContext,
} from "./harness/component";

export interface MountOptions<P> {
  props?: P;
  hooks?: Partial<HookValues>;
  commands?: CommandResults;
  /** Seed values for parametric query hooks (usePrice / usePriceHistory). */
  parametric?: ParametricSeed;
}

const mounted: MountedRoot[] = [];

export function mount<P, Page extends MountedComponent<P>>(
  token: ComponentToken<P, Page>,
  opts: MountOptions<P> = {},
): Page {
  const world = createWorld(opts.hooks, opts.commands, opts.parametric);
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
    commands: world.commands,
  };
  return token.makePage(ctx);
}

/** Unmount everything mounted since the last cleanup (call in afterEach). */
export function cleanupMounted(): void {
  while (mounted.length > 0) mounted.pop()!.unmount();
}
