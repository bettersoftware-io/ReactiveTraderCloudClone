import { cleanup, render, screen } from "@testing-library/react";

import { ReactorRings } from "#/ui/shell/auth/wait/ReactorRings";

const MARKER_TEST_ID = "emblem-marker";
const RING_SELECTOR = "svg[aria-hidden='true']";

export interface ReactorRingsPage {
  mount(): void;
  unmountAll(): void;
  exists(testId: string): boolean;
  ringCount(): number;
  hasRoot(): boolean;
  rootContainsMarker(): boolean;
  rootContainsEveryRing(): boolean;
  /** True when no ring is the marker's nearest `[data-testid="emblem-marker"]`
   * ancestor AND no ring contains the marker — i.e. the emblem is a sibling
   * slot the rings surround, not a container that clips it. */
  noRingContainsOrWrapsMarker(): boolean;
}

/** The framework surface for `ReactorRings.test.tsx`. */
export function reactorRingsPage(): ReactorRingsPage {
  // The render container itself (RTL appends a wrapper `<div>` to
  // document.body) — `container.firstElementChild` is ReactorRings' OWN root
  // `<div className={styles.root}>`, one level below the container. Reading
  // straight off `document.body` instead would resolve to the container
  // itself, silently weakening every containment assertion below to "a
  // render happened" rather than "these elements share ReactorRings' root".
  let container: HTMLElement | null = null;

  function marker(): HTMLElement {
    return screen.getByTestId(MARKER_TEST_ID);
  }

  function root(): Element | null {
    return container?.firstElementChild ?? null;
  }

  function rings(): NodeListOf<Element> {
    return (container ?? document.body).querySelectorAll(RING_SELECTOR);
  }

  return {
    mount(): void {
      const result = render(
        <ReactorRings>
          <span data-testid={MARKER_TEST_ID}>emblem</span>
        </ReactorRings>,
      );

      container = result.container;
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    ringCount(): number {
      return rings().length;
    },
    hasRoot(): boolean {
      return root() != null;
    },
    rootContainsMarker(): boolean {
      return root()?.contains(marker()) ?? false;
    },
    rootContainsEveryRing(): boolean {
      const rootEl = root();

      return Array.from(rings()).every((ring) => {
        return rootEl?.contains(ring) ?? false;
      });
    },
    noRingContainsOrWrapsMarker(): boolean {
      const el = marker();

      return Array.from(rings()).every((ring) => {
        return (
          ring.closest(`[data-testid="${MARKER_TEST_ID}"]`) == null &&
          !ring.contains(el)
        );
      });
    },
  };
}
