import type { HookValues, CommandLog } from "./world";

/** Everything a page object needs: the rendered root + update drivers + command log. */
export interface PageContext<P> {
  readonly root: HTMLElement;
  setProps(next: Partial<P>): void;
  emit(patch: Partial<HookValues>): void;
  readonly commands: CommandLog;
}

/** Base class for all page objects. Provides the neutral update drivers. */
export abstract class MountedComponent<P> {
  protected readonly root: HTMLElement;
  private readonly ctx: PageContext<P>;

  constructor(ctx: PageContext<P>) {
    this.root = ctx.root;
    this.ctx = ctx;
  }

  /** Push new props → re-render the same instance. */
  setProps(next: Partial<P>): void {
    this.ctx.setProps(next);
  }

  /** Push new hook data → re-render the same instance. */
  emit(patch: Partial<HookValues>): void {
    this.ctx.emit(patch);
  }

  /** Inputs recorded by the faked command hooks (unit-mode convenience). */
  protected commandLog(): CommandLog {
    return this.ctx.commands;
  }
}

/** Neutral handle for a component: carries its prop type and a page factory. */
export interface ComponentToken<P, Page extends MountedComponent<P>> {
  readonly makePage: (ctx: PageContext<P>) => Page;
}

export function component<P, Page extends MountedComponent<P>>(
  makePage: (ctx: PageContext<P>) => Page,
): ComponentToken<P, Page> {
  return { makePage };
}
