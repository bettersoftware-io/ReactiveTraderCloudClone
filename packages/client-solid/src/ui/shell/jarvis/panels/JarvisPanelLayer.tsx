import type { Accessor, JSX } from "solid-js";
import { createMemo, For, Show } from "solid-js";

import { type JarvisPanelVm, MAX_DOCKED_PANELS } from "@rtc/client-core";
import { useViewModel } from "@rtc/solid-bindings";

import { JarvisPanelBody } from "./JarvisPanelBody";

import styles from "./JarvisPanelLayer.module.css";

/**
 * Fixed top-right cascade stack for J.A.R.V.I.S.'s generative-UI desk panels
 * (docs/architecture/18-jarvis-ai-agent-surface.md). Mounted as `JarvisOverlay`'s
 * SIBLING in App.tsx, not its child: panels keep rendering (and their own
 * `data$` keeps ticking) whether the chat overlay is open or closed.
 *
 * Renders `floatingPanels` ONLY — a docked panel leaves this layer entirely
 * and renders instead as a leaf inside the workspace engine (see
 * `dockedRegistryFor` in `appPanelRegistry.tsx`, wired from `App.tsx`).
 * `dockedPanels().length` still needs reading here, though, to gate the 📌
 * dock button once `MAX_DOCKED_PANELS` is reached.
 *
 * Chrome (title/rationale/dismiss/dock/testids) reads only
 * `useJarvisPanels()` — the list that changes on spawn/dismiss/edit/dock.
 * Each panel's BODY reads its own `useJarvisPanelData(panelId)`
 * independently (a keyed `state()` in solid-bindings mirroring
 * `useCandles`/`useDepth`), so one panel's tick cadence never re-renders its
 * siblings or the chrome list itself.
 *
 * `floatingPanels$` re-maps a FRESH `JarvisPanelVm[]` on every machine-state
 * emission (spawn/dismiss/edit/dock of ANY panel), so a naive `<For each={floatingPanels()}>`
 * would remount every card on every list change, not just the affected one
 * (Solid's `<For>` diffs by item identity). The id-then-lookup pattern below
 * (`panelIds()` — an array of stable `panelId` strings — feeding `<For>`,
 * with the live VM looked up per id) is the Solid analogue of React's
 * `key={panel.panelId}`: `<For>` only mounts/unmounts a card when its id
 * genuinely enters/leaves the list. The inner `<Show>` is deliberately
 * NON-keyed (an Accessor, not `keyed`) so `JarvisPanelCard` receives a LIVE
 * `panel` accessor rather than a frozen snapshot — an unrelated panel's
 * lifecycle event updates props in place instead of remounting this card
 * (which would otherwise replay its entrance animation or interrupt an
 * in-flight dismiss).
 */
export function JarvisPanelLayer(): JSX.Element {
  const { useJarvisPanels } = useViewModel();
  const { dockedPanels, floatingPanels, dismissPanel, dockPanel } =
    useJarvisPanels();

  const panelIds = createMemo((): string[] => {
    return floatingPanels().map((panel) => {
      return panel.panelId;
    });
  });

  // `dockedPanels.length >= MAX_DOCKED_PANELS` — disables the 📌 dock
  // button rather than letting it fire a no-op the panels machine would
  // silently swallow anyway, so the cap is legible in the UI. An Accessor
  // (not a plain boolean), matching `panel` below, so every mounted card
  // reflects the cap live as OTHER panels dock/undock, not just its own.
  const dockFull = createMemo((): boolean => {
    return dockedPanels().length >= MAX_DOCKED_PANELS;
  });

  return (
    <Show when={floatingPanels().length > 0}>
      <div data-testid="jarvis-panel-layer" class={styles.layer}>
        <For each={panelIds()}>
          {(panelId: string): JSX.Element => {
            const panel = createMemo((): JarvisPanelVm | undefined => {
              return floatingPanels().find((p) => {
                return p.panelId === panelId;
              });
            });

            return (
              <Show when={panel()}>
                {(currentPanel: Accessor<JarvisPanelVm>): JSX.Element => {
                  return (
                    <JarvisPanelCard
                      panel={currentPanel}
                      dockFull={dockFull}
                      onDismiss={dismissPanel}
                      onDock={dockPanel}
                    />
                  );
                }}
              </Show>
            );
          }}
        </For>
      </div>
    </Show>
  );
}

interface JarvisPanelCardProps {
  panel: Accessor<JarvisPanelVm>;
  /** `dockedPanels.length >= MAX_DOCKED_PANELS` — see `dockFull`'s doc in
   * `JarvisPanelLayer` above. */
  dockFull: Accessor<boolean>;
  onDismiss: (panelId: string) => void;
  onDock: (panelId: string) => void;
}

function JarvisPanelCard(props: JarvisPanelCardProps): JSX.Element {
  const { useJarvisPanelData, usePowerSaver } = useViewModel();
  // eslint-disable-next-line solid/reactivity -- setup-scope read is correct: this card's panelId is fixed for its whole lifetime (the parent's id-then-lookup <For>/<Show> only ever mounts one JarvisPanelCard per id — see JarvisPanelLayer's doc comment).
  const data = useJarvisPanelData(props.panel().panelId);
  const { isFreeze } = usePowerSaver();
  let rootRef: HTMLDivElement | undefined;

  // Dismiss = one transform+opacity WAAPI transition, played through the raw
  // `Element.animate` (mirroring useFlipGrid.ts's own established
  // convention in this client — solid-motionone isn't wired up, so there is
  // no "single sanctioned wrapper" import site here the way react's
  // animateOnce is), THEN the real intent fires — so the panel is already
  // invisible by the time it leaves useJarvisPanels()'s list and this
  // component unmounts. Skipped outright under freeze/reduced-motion
  // (mirrors useFlipGrid's exit-ghost gating) — no timer calls anywhere, per
  // the src/ui timers gate.
  //
  // Split into a sync `onClick` target + an async worker: a JSX event
  // handler prop must return `void`, so `@typescript-eslint/no-misused-promises`
  // rejects an `async` function passed straight to `onClick` (a dropped
  // rejection would otherwise fail silently).
  function dismissThisPanel(): void {
    void animateOutThenDismissPanel();
  }

  function dockThisPanel(): void {
    props.onDock(props.panel().panelId);
  }

  async function animateOutThenDismissPanel(): Promise<void> {
    const el = rootRef;

    if (
      el &&
      !isFreeze() &&
      !prefersReducedMotion() &&
      typeof el.animate === "function"
    ) {
      await el.animate(
        [
          { opacity: 1, transform: "translateY(0) scale(1)" },
          { opacity: 0, transform: "translateY(-8px) scale(0.96)" },
        ],
        { duration: DISMISS_DURATION_MS, easing: "ease" },
      ).finished;
    }

    props.onDismiss(props.panel().panelId);
  }

  return (
    <div
      ref={rootRef}
      data-testid="jarvis-panel"
      data-panel-id={props.panel().panelId}
      data-status={props.panel().status}
      class={styles.panel}
      title={props.panel().rationale ?? undefined}
    >
      <div class={styles.head}>
        <span class={styles.title}>{props.panel().title}</span>
        <div class={styles.actions}>
          <button
            type="button"
            data-testid="jarvis-panel-dock"
            aria-label={`Pin ${props.panel().title} to workspace`}
            class={styles.dismiss}
            disabled={props.dockFull()}
            onClick={dockThisPanel}
          >
            📌
          </button>
          <button
            type="button"
            data-testid="jarvis-panel-dismiss"
            aria-label={`Dismiss ${props.panel().title}`}
            class={styles.dismiss}
            onClick={dismissThisPanel}
          >
            ✕
          </button>
        </div>
      </div>
      {/* Keyed by the resolved viz kind (falling back to a stable sentinel
          while unresolved/unsupported) so a spec EDIT that swaps viz kind
          remounts the body — a plain CSS crossfade (one-shot fade-in,
          gated in the freeze/reduced-motion blocks below), no FLIP: the
          panel's own box doesn't move on a viz swap, only its contents. */}
      <Show when={data()?.kind ?? props.panel().status} keyed>
        {(_bodyKey: string): JSX.Element => {
          return (
            <div class={styles.body}>
              <JarvisPanelBody panel={props.panel} data={data()} />
            </div>
          );
        }}
      </Show>
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

const DISMISS_DURATION_MS = 180;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
