// @vitest-environment jsdom

import { BehaviorSubject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  CORE_OPTIONS,
  type CoreHostState,
  type CoreSwapView,
  followCoreSwaps,
} from "@rtc/web-boot";

describe("followCoreSwaps", () => {
  it("shows nothing and leaves the app tree live while no swap is under way", () => {
    const page = createPage();

    expect(page.shown).toEqual([null]);
    expect(page.rootEl.inert).toBe(false);
  });

  it.each(["covering", "loading", "handover", "revealing"] as const)(
    "%s → the swap is shown and the app tree is inert",
    (phase) => {
      const page = createPage();

      page.states.next({ phase, from: "rxjs", to: "effect" });

      expect(page.shown.at(-1)).toEqual({
        from: CORE_OPTIONS[0],
        to: CORE_OPTIONS[2],
        phase,
      });
      expect(page.rootEl.inert).toBe(true);
    },
  );

  it("a swap that lands releases the app tree and removes the cover", () => {
    const page = createPage();

    for (const phase of SWAP_PHASES) {
      page.states.next({ phase, from: "rxjs", to: "effect" });
    }

    page.states.next({ phase: "running", impl: "effect" });

    expect(page.shown.at(-1)).toBeNull();
    expect(page.rootEl.inert).toBe(false);
  });

  it("a load that fails (the host lifts the cover without a handover) releases the app tree", () => {
    const page = createPage();

    for (const phase of ["covering", "loading", "revealing"] as const) {
      page.states.next({ phase, from: "rxjs", to: "effect" });
      expect(page.rootEl.inert).toBe(true);
    }

    page.states.next(RUNNING);

    expect(page.shown.at(-1)).toBeNull();
    expect(page.rootEl.inert).toBe(false);
  });

  it("a cover that never comes up (the host goes straight back to running) releases the app tree", () => {
    const page = createPage();

    page.states.next({ phase: "covering", from: "rxjs", to: "effect" });
    page.states.next(RUNNING);

    expect(page.rootEl.inert).toBe(false);
  });

  it("a fatal swap releases the app tree: the boot-error screen in it must be usable", () => {
    const page = createPage();

    page.states.next({ phase: "covering", from: "rxjs", to: "effect" });
    page.states.next({ phase: "handover", from: "rxjs", to: "effect" });
    page.states.next({ phase: "fatal" });

    expect(page.shown.at(-1)).toBeNull();
    expect(page.rootEl.inert).toBe(false);
  });

  it("a swap that ends hands focus to the dialog the app tree has open", () => {
    const page = createPage();
    const dialog = createDialogIn(page.rootEl);

    for (const phase of SWAP_PHASES) {
      page.states.next({ phase, from: "rxjs", to: "effect" });
      expect(document.activeElement).not.toBe(dialog);
    }

    page.states.next({ phase: "running", impl: "effect" });

    expect(document.activeElement).toBe(dialog);
  });

  it("focus is not moved while no swap has run: a dialog the user left stays left", () => {
    const page = createPage();
    const dialog = createDialogIn(page.rootEl);

    page.states.next(RUNNING);

    expect(document.activeElement).not.toBe(dialog);
  });

  it("the app tree is inert before the cover is asked for: no key reaches it once the swap has begun", () => {
    const rootEl = document.createElement("div");
    rootEl.inert = false;
    const states = new BehaviorSubject<CoreHostState>(RUNNING);
    const inertWhenShown: boolean[] = [];

    followCoreSwaps(states, {
      rootEl,
      options: CORE_OPTIONS,
      show: () => {
        inertWhenShown.push(rootEl.inert);
      },
    });
    states.next({ phase: "covering", from: "rxjs", to: "effect" });

    expect(inertWhenShown).toEqual([false, true]);
  });
});

const SWAP_PHASES = ["covering", "loading", "handover", "revealing"] as const;

interface Page {
  readonly rootEl: HTMLElement;
  readonly states: BehaviorSubject<CoreHostState>;
  /** Every `show` call's argument, oldest first. */
  readonly shown: (CoreSwapView | null)[];
}

/** A focusable dialog inside `rootEl`, attached to the document. */
function createDialogIn(rootEl: HTMLElement): HTMLElement {
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.tabIndex = -1;
  rootEl.append(dialog);
  document.body.append(rootEl);

  return dialog;
}

/** An app root and a host state stream (starting at `running`), followed. */
function createPage(): Page {
  const rootEl = document.createElement("div");
  // jsdom does not implement `inert`: give the element the property a
  // browser has, so a missing write reads as `false`, not `undefined`.
  rootEl.inert = false;
  const states = new BehaviorSubject<CoreHostState>(RUNNING);
  const shown: (CoreSwapView | null)[] = [];

  followCoreSwaps(states, {
    rootEl,
    options: CORE_OPTIONS,
    show: (swap: CoreSwapView | null): void => {
      shown.push(swap);
    },
  });

  return { rootEl, states, shown };
}

const RUNNING: CoreHostState = { phase: "running", impl: "rxjs" };
