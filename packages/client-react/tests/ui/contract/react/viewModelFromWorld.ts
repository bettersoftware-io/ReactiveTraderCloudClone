import type { JarvisWorld, World } from "@ui-contract/harness/world";
import { useCallback, useState, useSyncExternalStore } from "react";
import { BehaviorSubject, EMPTY, type Observable, of, throwError } from "rxjs";
import { catchError, map } from "rxjs/operators";

import type {
  DriveOutcome,
  JarvisDemoMachineHandle,
  JarvisDriverMachineHandle,
  JarvisMachineHandle,
  JarvisPanelVm,
  LayoutIntents,
  LayoutNode,
  LayoutState,
  Machine,
  PanelData,
  RfqSubmissionState,
  TicketSubmissionState,
  WorkspaceNavIntents,
  WorkspaceNavState,
} from "@rtc/client-core";
import {
  createBootSequenceMachine,
  createDefaultLayoutPort,
  createJarvisDemoMachine,
  createJarvisDriverMachine,
  createJarvisMachine,
  createJarvisPanelsMachine,
  createLayoutMachine,
  createNotionalMachine,
  createOrderTicketMachine,
  createRfqCountdownMachine,
  createRfqTileMachine,
  createRowHighlightMachine,
  createStaleFlagMachine,
  createTileExecutionMachine,
  createWorkspaceNavMachine,
  JarvisPanelsPresenter,
  type WorkspaceTab,
} from "@rtc/client-core";
import type {
  AmbientStyle,
  CandleTimeframe,
  CreateRfqInput,
  CreditRfqFilter,
  CurrencyPair,
  EqBlotterView,
  EqWatchlistSort,
  ExecuteTradeInput,
  ExecuteTradeResult,
  JarvisBrain,
  JarvisEffort,
  JarvisNarratorPreference,
  JarvisSkin,
  LoginWaitDelay,
  LoginWaitStyle,
  PlaceOrderRequest,
  PowerSaverLevel,
  RfqQuoteResult,
  ThemeSkin,
  ViewMode,
} from "@rtc/domain";
import {
  nextEqWatchlistSort,
  nextPowerSaverLevel,
  nextThemeModePreference,
  resolveThemeMode,
} from "@rtc/domain";
import type { ViewModel } from "@rtc/react-bindings";
import { useMachine } from "@rtc/react-bindings";

/** Mirror of RfqsPresenter's presenter-local redirect delay. The contract spec
 * drives this with fake timers (advanceTimersByTimeAsync(1500)), so the fake
 * schedules onRedirect via a REAL setTimeout — preserving the exact timing the
 * spec asserts, instead of redirecting instantly. */
const REDIRECT_DELAY_MS = 1500;

/** Subscribe a React component to a BehaviorSubject; re-render on each emission. */
function useSubject<T>(subject: BehaviorSubject<T>): T {
  return useSyncExternalStore(
    (onChange) => {
      const sub = subject.subscribe(onChange);

      return () => {
        return sub.unsubscribe();
      };
    },
    () => {
      return subject.getValue();
    },
  );
}

interface Unsubscribable {
  unsubscribe(): void;
}

/** A warmed `@rx-state/core` `StateObservable` — structurally typed here (not
 * imported by name) so this test-only package doesn't need its own dependency
 * on `@rx-state/core` (a transitive dep via `@rtc/client-core`). */
interface PeekableState<T> {
  subscribe(onNext: (v: T) => void): Unsubscribable;
  getValue(): T | Promise<T>;
}

/** Subscribe a React component to a shared machine's `state$` (mirrors
 * useSubject, for the eqWorkspace singleton which — unlike the per-mount
 * `useMachine`-bridged machines — is constructed once for the whole World). */
function useMachineState<T>(state$: PeekableState<T>): T {
  return useSyncExternalStore(
    (onChange) => {
      const sub = state$.subscribe(onChange);

      return () => {
        return sub.unsubscribe();
      };
    },
    () => {
      const v = state$.getValue();

      if (v instanceof Promise) {
        throw new Error("eqWorkspace state$ not initialized");
      }

      return v;
    },
  );
}

/** The REAL createJarvisMachine, one shared instance PER WORLD — keyed by
 * World identity (not built inside createWorld itself, since the machine is
 * an application-layer concern; see world.ts's `JarvisWorld` doc comment).
 * Every `reactViewModel(world)` call (one per `mountWith`/`mount`) reuses the
 * same cached machine, mirroring world.eqWorkspace's per-World singleton so a
 * co-mounted JarvisOrb + JarvisOverlay observe the same open/phase/entries.
 * Typed as the widened `JarvisMachineHandle` (not the plain `Machine`) so
 * `getJarvisPanelsBridge` below can read its `events$` — Task 6's sole event
 * source for the generative-UI panels machine, mirroring composition.ts's own
 * `jarvis.events$` wiring. */
const jarvisMachines = new WeakMap<World, JarvisMachineHandle>();

function getJarvisMachine(world: World): JarvisMachineHandle {
  let machine = jarvisMachines.get(world);

  if (!machine) {
    // Typed explicitly (rather than left to inference) so this driver is a
    // real consumer of World.jarvis's declared shape, not just a structural
    // one — see world.ts's JarvisWorld doc comment.
    const jarvisWorld: JarvisWorld = world.jarvis;
    machine = createJarvisMachine({
      port: jarvisWorld.port,
      skin$: world.jarvisSkin,
      setSkin: (skin: JarvisSkin) => {
        world.jarvisSkin.next(skin);
      },
      // World.jarvisAvailability is the structured JarvisAvailability
      // directly (Task 10) — no mapping needed.
      availability$: world.jarvisAvailability,
      // The STORED brain/effort preferences (Task 10) — threaded straight
      // from World so a spec's mount({ jarvisBrain, jarvisEffort }) seed (or
      // a live write through useJarvisPreferences().setBrain/setEffort)
      // actually resolves the machine's effectiveBrain / turn options.
      preferredBrain$: world.jarvisBrain,
      effort$: world.jarvisEffort,
    });
    jarvisMachines.set(world, machine);
    // Register this World's real narrate() intent (Task 12/P5) so
    // world.jarvis.narrate(prompt) — a spec's proactive-turn counterpart to
    // driving send() through a mounted overlay — routes to the SAME machine
    // instance every other Jarvis-consuming component on this World shares.
    // See JarvisWorld.narrate's doc in world.ts.
    world.jarvis.registerNarrate(machine.intents.narrate);
  }

  return machine;
}

/** Every `PanelId` reachable in one layout tree, walked from its root — a
 * `"panel"` leaf contributes its own id, a `"split"` node contributes its
 * children's. Mirrors `composition.ts`'s own `collectPanelIds` (private
 * there) — this test-only fixture keeps its own copy rather than reaching
 * into `@rtc/client-core`'s composition-root internals, exactly like
 * `JarvisPanelLayer.contract.spec.ts` keeps its own copy of
 * `ScriptedJarvisEngine`'s module-private `SCRIPTED_PANEL_ID`. */
function collectPanelIds(node: LayoutNode): readonly string[] {
  if (node.kind === "panel") {
    return [node.panelId];
  }

  return node.children.flatMap(collectPanelIds);
}

/** `JarvisDriverMachine`'s `knownLayoutPanelIds` dep source (Task 12/P5) —
 * the static panel ids in `tab`'s DEFAULT layout tree, mirroring
 * `composition.ts`'s `LAYOUT_PANEL_IDS`. Computed fresh per call (no
 * module-load cache, unlike composition.ts's optimization) since a test
 * fixture's call volume never warrants it. */
function knownLayoutPanelIds(tab: WorkspaceTab): readonly string[] {
  return collectPanelIds(createDefaultLayoutPort(tab).initial.root);
}

/** The REAL `createWorkspaceNavMachine`, one shared instance PER WORLD —
 * same per-World-singleton doctrine as `jarvisMachines` above (Task 12/P5).
 * `App.tsx`'s own promoted composition-root singleton (`Presenters.
 * workspaceNav`) is the production mirror of this cache: a driven
 * `"switchTab"` command targets the SAME instance a mounted `AppShell`'s
 * `useWorkspaceNav()` reads from. */
const workspaceNavs = new WeakMap<
  World,
  Machine<WorkspaceNavState, WorkspaceNavIntents>
>();

function getWorkspaceNav(
  world: World,
): Machine<WorkspaceNavState, WorkspaceNavIntents> {
  let machine = workspaceNavs.get(world);

  if (!machine) {
    machine = createWorkspaceNavMachine();
    workspaceNavs.set(world, machine);
  }

  return machine;
}

/** The REAL per-tab `createLayoutMachine` SINGLETON map, one map PER WORLD —
 * mirrors `composition.ts`'s `layoutFor` (Task 12/P5): a driven `"layout"`
 * command (via `JarvisDriverMachine`'s `layout` dep, wired below) targets the
 * EXACT instance a mounted `AppShell`'s `useLayout(tab)` reads from, instead
 * of a throwaway per-mount machine nothing else observes (the Task 6 review
 * defect `composition.ts`'s own `layoutFor` doc describes). Built lazily,
 * one entry per tab, on first request — cheap either way (4-entry cap). */
const layoutHandles = new WeakMap<
  World,
  Map<WorkspaceTab, Machine<LayoutState, LayoutIntents>>
>();

function getLayoutFor(
  world: World,
  tab: WorkspaceTab,
): Machine<LayoutState, LayoutIntents> {
  let byTab = layoutHandles.get(world);

  if (!byTab) {
    byTab = new Map();
    layoutHandles.set(world, byTab);
  }

  let machine = byTab.get(tab);

  if (!machine) {
    machine = createLayoutMachine(createDefaultLayoutPort(tab));
    byTab.set(tab, machine);
  }

  return machine;
}

/** The REAL `createJarvisDriverMachine`, one shared instance PER WORLD
 * (Task 12/P5) — mirrors `jarvisMachines`/`jarvisPanelsBridges`'s per-World
 * cache. Built from the SAME `getJarvisMachine(world).events$` the panels
 * bridge above reads (both guarded with the identical `catchError(() =>
 * EMPTY)`, mirroring `composition.ts`'s doc for why both folds need the
 * source guarded independently), targeting `getWorkspaceNav`/`getLayoutFor`
 * above and `world.eqWorkspace` — the SAME singletons a mounted `AppShell`
 * reads from, so a driven command is observable through the real UI exactly
 * like production. Also wires `outcomes$` into
 * `getJarvisMachine(world).intents.recordDriveOutcome` (composition.ts's own
 * late-bound subscription, reproduced here) so applied commands fold into
 * the transcript as `"drive: <kind>"` rows. */
const jarvisDrivers = new WeakMap<World, JarvisDriverMachineHandle>();

function getJarvisDriverMachine(world: World): JarvisDriverMachineHandle {
  let driver = jarvisDrivers.get(world);

  if (!driver) {
    const machine = getJarvisMachine(world);
    driver = createJarvisDriverMachine({
      events$: machine.events$.pipe(
        catchError(() => {
          return EMPTY;
        }),
      ),
      workspaceNav: getWorkspaceNav(world),
      layout: (tab: WorkspaceTab) => {
        return getLayoutFor(world, tab);
      },
      eqWorkspace: world.eqWorkspace,
      setThemeSkin: (skin: ThemeSkin) => {
        world.themeSkin.next(skin);
      },
      setPowerSaver: (level: PowerSaverLevel) => {
        world.powerSaverLevel.next(level);
      },
      dismissPanel: (panelId: string) => {
        getJarvisPanelsBridge(world).dismissPanel(panelId);
      },
      knownLayoutPanelIds,
      knownSymbols$: world.watchlist.pipe(
        map((list) => {
          return list.map((instrument) => {
            return instrument.symbol;
          });
        }),
      ),
      powerSaverLevel$: world.powerSaverLevel,
    });
    jarvisDrivers.set(world, driver);

    driver.outcomes$.subscribe((outcome: DriveOutcome) => {
      machine.intents.recordDriveOutcome(outcome);
    });
  }

  return driver;
}

/** The REAL `createJarvisDemoMachine`, one shared instance PER WORLD —
 * mirrors `jarvisDrivers`'s per-World cache above. Reads `getJarvisMachine
 * (world).state$`/`.events$` (the SAME `catchError(() => EMPTY)` guard
 * `getJarvisDriverMachine` applies to `events$` — its own `events$` input is
 * equally terminal on error) and `jarvis.intents` narrowed to the four
 * members the demo actually drives, exactly like `composition.ts`'s own
 * `jarvisDemo` wiring. */
const jarvisDemos = new WeakMap<World, JarvisDemoMachineHandle>();

function getJarvisDemoMachine(world: World): JarvisDemoMachineHandle {
  let demo = jarvisDemos.get(world);

  if (!demo) {
    const machine = getJarvisMachine(world);
    demo = createJarvisDemoMachine({
      jarvisState$: machine.state$,
      jarvisEvents$: machine.events$.pipe(
        catchError(() => {
          return EMPTY;
        }),
      ),
      jarvis: machine.intents,
      powerSaverLevel$: world.powerSaverLevel,
    });
    jarvisDemos.set(world, demo);
  }

  return demo;
}

/**
 * Bridges the REAL `JarvisPanelsPresenter` (Task 9) into plain
 * BehaviorSubjects this driver's existing `useSubject` helper can read.
 * `presenter.panels$`/`presenter.panelData$(panelId)` are ordinary (non-
 * Behavior) Observables, and this test-only fixtures package deliberately
 * has no direct `@rx-state/core` dependency (unlike client-solid's sibling
 * fixture — see that package's own viewModelFromWorld.ts), so a manual
 * warm-subscribe-into-a-BehaviorSubject bridge is the shape that fits here.
 * One bridge per World, cached like `jarvisMachines` above. The subscribe
 * below is safe to treat as synchronously-seeded: `createJarvisPanelsMachine`
 * keeps its own `state$` warm internally (see that file's doc), so
 * `presenter.panels$` always has a current value to replay the moment this
 * bridge subscribes — mirroring `useSubject`'s own BehaviorSubject
 * assumption. The presenter's OWN internal caches (composePanelStream's
 * per-panelId warm subscriptions) are what actually keep a live panel's port
 * streams flowing independent of whether any component is currently mounted
 * to read them; this bridge only rehosts that same data as something React's
 * `useSyncExternalStore`-backed `useSubject` can read synchronously. */
interface JarvisPanelsBridge {
  readonly panels$: BehaviorSubject<readonly JarvisPanelVm[]>;
  readonly dismissPanel: (panelId: string) => void;
  panelData$(panelId: string): BehaviorSubject<PanelData | null>;
}

const jarvisPanelsBridges = new WeakMap<World, JarvisPanelsBridge>();

function getJarvisPanelsBridge(world: World): JarvisPanelsBridge {
  const cached = jarvisPanelsBridges.get(world);

  if (cached) {
    return cached;
  }

  const machine = getJarvisMachine(world);
  // `createJarvisPanelsMachine`'s `events$` input is TERMINAL on error (kills
  // its fold) — same catchError/EMPTY guard composition.ts applies to the
  // real `jarvis.events$` before handing it to the same factory.
  const presenter = new JarvisPanelsPresenter(
    createJarvisPanelsMachine(
      machine.events$.pipe(
        catchError(() => {
          return EMPTY;
        }),
      ),
    ),
    world.panelStreamDeps,
  );

  const panels$ = new BehaviorSubject<readonly JarvisPanelVm[]>([]);
  presenter.panels$.subscribe(panels$);

  const dataSubjects = new Map<string, BehaviorSubject<PanelData | null>>();

  function panelData$(panelId: string): BehaviorSubject<PanelData | null> {
    const cachedSubject = dataSubjects.get(panelId);

    if (cachedSubject) {
      return cachedSubject;
    }

    const subject = new BehaviorSubject<PanelData | null>(null);
    presenter.panelData$(panelId).subscribe(subject);
    dataSubjects.set(panelId, subject);
    return subject;
  }

  const bridge: JarvisPanelsBridge = {
    panels$,
    dismissPanel: presenter.dismissPanel,
    panelData$,
  };
  jarvisPanelsBridges.set(world, bridge);
  return bridge;
}

/** Build a reactive ViewModel backed by the neutral World. */
export function reactViewModel(world: World): ViewModel {
  const s = world.sources;
  return {
    // Parametric query hooks: each call subscribes to the World's per-key
    // subject, so a tile reading usePrice("EURUSD") re-renders only when that
    // symbol is pushed — faithfully mirroring @react-rxjs `bind`'s per-argument
    // streams (presenters.priceStream.price$(pair), priceHistory.history$(sym)).
    usePrice: (pair: CurrencyPair) => {
      return useSubject(world.priceFor(pair.symbol));
    },
    usePriceHistory: (symbol: string) => {
      return useSubject(world.historyFor(symbol));
    },
    useQuotesForRfq: (rfqId: number) => {
      return useSubject(world.quotesForRfq(rfqId));
    },
    // Nullary query hooks: reactive, re-render on push.
    useTrades: () => {
      return useSubject(s.useTrades);
    },
    // New-trade flagging lives in the presenter (not pinned by contract specs);
    // the fake reports no rows as new.
    useNewTradeIds: () => {
      return new Set<number>();
    },
    // The Activity feed's live/seed split and receipt-time stamping live in
    // the presenter (BlotterPresenter.activity$, not pinned by contract
    // specs) — specs inject the already-derived entries directly, the same
    // way they inject useTrades.
    useActivity: () => {
      return useSubject(s.useActivity);
    },
    useAnalytics: () => {
      return useSubject(s.useAnalytics);
    },
    useRfqs: () => {
      return useSubject(s.useRfqs);
    },
    useAllQuotes: () => {
      return useSubject(s.useAllQuotes);
    },
    useCurrencyPairs: () => {
      return useSubject(s.useCurrencyPairs);
    },
    useInstruments: () => {
      return useSubject(s.useInstruments);
    },
    useDealers: () => {
      return useSubject(s.useDealers);
    },
    useConnectionStatus: () => {
      return useSubject(s.useConnectionStatus);
    },
    // Command: record input and resolve undefined so the consuming component's
    // `await` proceeds to its post-await state transition.
    useAcceptQuote: () => {
      return async (quoteId: number) => {
        world.commands.acceptQuote.push(quoteId);
      };
    },
    // Command: record the cancelled rfq id, mirroring useAcceptQuote's shape
    // (one-shot fire-and-await; the bridge does firstValueFrom).
    useCancelRfq: () => {
      return async (rfqId: number) => {
        world.commands.cancelRfq.push(rfqId);
      };
    },
    // Command: record the reconnect invocation so contract specs can assert
    // "clicking Reconnect fires the command exactly once".
    useReconnect: () => {
      return () => {
        world.commands.reconnect += 1;
      };
    },
    // Machine: the REAL createTileExecutionMachine, driven by a World-backed
    // execute command that records inputs and emits the canned result (or errors
    // to drive the timeout-confirmation path), faithfully exercising the
    // relocated lifecycle through the same useMachine bridge the app uses.
    useTileExecution: (pair: CurrencyPair) => {
      return useMachine(() => {
        return createTileExecutionMachine(pair, {
          execute: (input: ExecuteTradeInput) => {
            world.commands.executeTrade.push(input);

            if (world.results.executeTradeThrows) {
              return throwError(() => {
                return new Error("execute failed");
              }) as Observable<ExecuteTradeResult>;
            }

            const result = world.results.executeTrade;
            return result
              ? of(result)
              : (EMPTY as Observable<ExecuteTradeResult>);
          },
        });
      });
    },
    // Machine: the REAL createRfqTileMachine, driven by a World-backed
    // request-quote command that records inputs and emits the canned result (or
    // errors to drive the rejected path), exercising the relocated RFQ lifecycle
    // through the same useMachine bridge the app uses.
    useRfqTile: (pair: CurrencyPair) => {
      return useMachine(() => {
        return createRfqTileMachine(pair, {
          requestQuote: (symbol: string, pipsPosition: number) => {
            world.commands.requestRfqQuote.push({ symbol, pipsPosition });

            if (world.results.requestRfqQuoteThrows) {
              return throwError(() => {
                return new Error("rfq failed");
              }) as Observable<RfqQuoteResult>;
            }

            const result = world.results.requestRfqQuote;
            return result ? of(result) : (EMPTY as Observable<RfqQuoteResult>);
          },
        });
      });
    },
    // Intent-free derived flags: the REAL createStaleFlagMachine, sourced from
    // the World's connection-status subject and the per-key price / analytics
    // subjects — so disconnect/reconnect/new-value pushed onto the World drives
    // the relocated stale logic through the same useMachine bridge the app uses.
    useStaleFlag: (pair: CurrencyPair) => {
      return useMachine(() => {
        return createStaleFlagMachine({
          status$: s.useConnectionStatus,
          value$: world.priceFor(pair.symbol),
        });
      }).state;
    },
    useAnalyticsStaleFlag: () => {
      return useMachine(() => {
        return createStaleFlagMachine({
          status$: s.useConnectionStatus,
          value$: s.useAnalytics,
        });
      }).state;
    },
    // Intent-free derived flag: the REAL createRowHighlightMachine. The contract
    // spec drives the 3s fade with fake timers, so the real RxJS timer(HIGHLIGHT_MS)
    // is driven by the spec's advanceTimersByTime through the same useMachine bridge
    // the app uses — preserving the exact fade timing.
    useRowHighlight: (isNew: boolean) => {
      return useMachine(() => {
        return createRowHighlightMachine(isNew);
      }).state;
    },
    // Machine: the REAL createNotionalMachine, exercising the relocated notional
    // logic through the same useMachine bridge the app uses.
    useNotional: (defaultNotional: number) => {
      return useMachine(() => {
        return createNotionalMachine(defaultNotional);
      });
    },
    // Submission machine fake: stateful per-mount store that records the RFQ to
    // world.commands.createRfq, flips editing→submitting→confirmed, and schedules
    // onRedirect via a REAL setTimeout(REDIRECT_DELAY_MS) so the spec's fake-timer
    // advance drives the redirect with the same timing as the real RxJS timer.
    // Mirrors RfqsPresenter.createSubmission: the same timeout that fires
    // onRedirect also returns the state to editing — the docked panel is never
    // unmounted, so the fake must hand back an empty editing state exactly
    // like the real machine, or specs would never exercise the reset path.
    useRfqSubmission: () => {
      const [submissionState, setSubmissionState] =
        useState<RfqSubmissionState>({
          status: "editing",
        });

      const submit = useCallback(
        (input: CreateRfqInput, onRedirect: (rfqId: number) => void) => {
          world.commands.createRfq.push(input);
          setSubmissionState({ status: "submitting" });
          // Mirror the real machine, where submitting is emitted synchronously
          // and confirmed only arrives after the async create-RFQ RPC resolves.
          // With no seeded result the submission stays in flight, so a spec can
          // observe the transient "Submitting…" render; when a result IS seeded
          // the fake confirms in the same tick (editing→confirmed) as before.
          const rfqId = world.results.createRfq;

          if (rfqId === undefined) {
            return;
          }

          setSubmissionState({ status: "confirmed", rfqId });
          setTimeout(() => {
            onRedirect(rfqId);
            setSubmissionState({ status: "editing" });
          }, REDIRECT_DELAY_MS);
        },
        [],
      );
      return { state: submissionState, submit };
    },
    // Ticket submission machine fake: stateful per-mount store that records the
    // quote/pass command to world.commands.* and flips submitted:true, mirroring
    // the relocated submit-price / pass flow.
    useTicketSubmission: () => {
      const [ticketState, setTicketState] = useState<TicketSubmissionState>({
        submitted: false,
      });

      const submitPrice = useCallback((quoteId: number, price: number) => {
        world.commands.quoteRfq.push({ quoteId, price });
        setTicketState({ submitted: true });
      }, []);

      const pass = useCallback((quoteId: number) => {
        world.commands.passQuote.push(quoteId);
        setTicketState({ submitted: true });
      }, []);
      return { state: ticketState, submitPrice, pass };
    },
    // Global throughput: reactive view backed by the World subject; setValue
    // records the value and optimistically echoes it into the view (mirroring
    // the presenter's immediate echo), so the panel reflects the edit at once.
    useThroughput: () => {
      const view = useSubject(world.throughput);
      return {
        ...view,
        setValue: (value: number) => {
          world.throughputSets.push(value);
          world.setThroughputView({ value });
        },
      };
    },
    // Global theme mode: reactive view backed by the World subject. The subject
    // holds the stored PREFERENCE (dark | light | system); `mode` is resolved for
    // painting and `cycle` advances the preference through the seam (mirroring the
    // PreferencesPort's replay-current themeMode$ stream). The harness has no OS
    // media query, so "system" resolves deterministically to dark.
    useThemePreference: () => {
      const modePreference = useSubject(world.themeMode);
      return {
        mode: resolveThemeMode(modePreference, true),
        modePreference,
        cycle: () => {
          // Read the current value (not the captured one) so rapid clicks each
          // advance from the true state, mirroring the real presenter's cycle().
          return world.themeMode.next(
            nextThemeModePreference(world.themeMode.getValue()),
          );
        },
      };
    },
    // Global theme skin: reactive view backed by the World subject; setSkin pushes
    // back so a change through the seam repaints the skin (mirroring the
    // PreferencesPort's replay-current themeSkin$ stream).
    useThemeSkinPreference: () => {
      const skin = useSubject(world.themeSkin);
      return {
        skin,
        setSkin: (next: ThemeSkin) => {
          return world.themeSkin.next(next);
        },
      };
    },
    // Animated background: reactive boolean backed by the World subject; setEnabled
    // /toggle push back so a click through the seam flips the rendered flag, and
    // each written value is recorded so a spec can assert the seam was written
    // (e.g. PreferencesModal's animated-bg toggle → animatedBackgroundSets [true]).
    useAnimatedBackground: () => {
      const enabled = useSubject(world.animatedBackground);
      return {
        enabled,
        setEnabled: (on: boolean) => {
          world.commands.animatedBackgroundSets.push(on);
          world.animatedBackground.next(on);
        },
        toggle: () => {
          const next = !enabled;
          world.commands.animatedBackgroundSets.push(next);
          world.animatedBackground.next(next);
        },
      };
    },
    // Power-saver master override: reactive 3-state level (off/calm/freeze)
    // backed by the World subject; setLevel/cycle push back so a click through
    // the seam advances the rendered level, and each written level is
    // recorded, mirroring useAnimatedBackground.
    usePowerSaver: () => {
      const level = useSubject(world.powerSaverLevel);
      return {
        level,
        isCalm: level !== "off",
        isFreeze: level === "freeze",
        setLevel: (next: PowerSaverLevel) => {
          world.commands.powerSaverLevelSets.push(next);
          world.powerSaverLevel.next(next);
        },
        cycle: () => {
          const next = nextPowerSaverLevel(level);
          world.commands.powerSaverLevelSets.push(next);
          world.powerSaverLevel.next(next);
        },
      };
    },
    // Ambient style: reactive view backed by the World subject (mirrors
    // useThemeSkinPreference above); setStyle pushes back so a click through
    // the seam (PreferencesModal's "Ambient style" segment) flips the
    // rendered AmbientBackground branch.
    useAmbientStyle: () => {
      const style = useSubject(world.ambientStyle);
      return {
        style,
        setStyle: (next: AmbientStyle) => {
          world.ambientStyle.next(next);
        },
      };
    },
    // Global force-boot-animation preference: reactive flag backed by the World
    // subject; setEnabled/toggle push back so a click through the seam flips
    // the rendered flag, and each written value is recorded, mirroring usePowerSaver.
    useForceBootAnimation: () => {
      const enabled = useSubject(world.forceBootAnimation);
      return {
        enabled,
        setEnabled: (on: boolean) => {
          world.commands.forceBootAnimationSets.push(on);
          world.forceBootAnimation.next(on);
        },
        toggle: () => {
          const next = !world.forceBootAnimation.value;
          world.commands.forceBootAnimationSets.push(next);
          world.forceBootAnimation.next(next);
        },
      };
    },
    // The two login-wait inspection preferences, same seam shape: reactive
    // reads off the World subjects, writes recorded so a spec can assert what
    // the user actually chose.
    useLoginWaitPreferences: () => {
      return {
        style: useSubject(world.loginWaitStyle),
        setStyle: (style: LoginWaitStyle) => {
          world.commands.loginWaitStyleSets.push(style);
          world.loginWaitStyle.next(style);
        },
        delay: useSubject(world.loginWaitDelay),
        setDelay: (delay: LoginWaitDelay) => {
          world.commands.loginWaitDelaySets.push(delay);
          world.loginWaitDelay.next(delay);
        },
      };
    },
    // Global view-mode: reactive view backed by the World subject; setViewMode
    // pushes back so a toggle through the seam flips the rendered mode.
    useViewModePreference: () => {
      const viewMode = useSubject(world.viewMode);
      return {
        viewMode,
        setViewMode: (next: ViewMode) => {
          return world.viewMode.next(next);
        },
      };
    },
    // Credit RFQs filter: reactive view backed by the World subject; setFilter
    // pushes back so a click through the seam (RfqsHead's pills, Task 4)
    // re-renders RfqsPanel — mirroring useViewModePreference exactly.
    useCreditRfqFilterPreference: () => {
      const filter = useSubject(world.creditRfqFilter);
      return {
        filter,
        setFilter: (next: CreditRfqFilter) => {
          return world.creditRfqFilter.next(next);
        },
      };
    },
    // Equities watchlist sort: reactive view backed by the World subject;
    // setSort pushes back directly, cycle() reads the CURRENT value (not a
    // captured one) so rapid clicks each advance from the true state —
    // mirroring the real presenter's cycle().
    useEqWatchlistSort: () => {
      const sort = useSubject(world.eqWatchlistSort);
      return {
        sort,
        setSort: (next: EqWatchlistSort) => {
          return world.eqWatchlistSort.next(next);
        },
        cycle: () => {
          return world.eqWatchlistSort.next(
            nextEqWatchlistSort(world.eqWatchlistSort.getValue()),
          );
        },
      };
    },
    // Equities blotter tab: reactive view backed by the World subject;
    // setView pushes back so a tab click through the seam flips the rendered
    // view (Task 5 consumes this).
    useEqBlotterView: () => {
      const view = useSubject(world.eqBlotterView);
      return {
        view,
        setView: (next: EqBlotterView) => {
          return world.eqBlotterView.next(next);
        },
      };
    },
    // Auth: reactive state backed by the World subject; login/unlock/lock/logout
    // push back so the seam transition re-renders LoginScreen/LockScreen, mirroring
    // AuthPresenter's lifecycle just closely enough for component specs.
    useAuth: () => {
      const state = useSubject(world.auth);
      return {
        state,
        login: (username: string, password: string) => {
          world.commands.authLoginArgs.push([username, password]);
        },
        unlock: (password: string) => {
          world.commands.authUnlock += 1;
          world.commands.authUnlockArgs.push(password);
          world.auth.next({
            ...world.auth.getValue(),
            locked: false,
            error: null,
          });
        },
        lock: () => {
          world.commands.authLock += 1;
          world.auth.next({ ...world.auth.getValue(), locked: true });
        },
        logout: () => {
          world.commands.authLogout += 1;
          world.auth.next({
            status: "unauthenticated",
            user: null,
            locked: false,
            unlocking: false,
            error: null,
            waitVariant: "handshake",
          });
        },
      };
    },
    // Boot gate: reactive visibility backed by the World subject; reboot
    // re-raises (recorded so a spec can assert "⟳ Reboot HUD fires once"),
    // dismiss lowers — mirroring the real BootGatePresenter seam.
    useBootGate: () => {
      const visible = useSubject(world.bootGate);
      return {
        visible,
        reboot: () => {
          world.commands.bootReboot += 1;
          world.bootGate.next(true);
        },
        dismiss: () => {
          world.bootGate.next(false);
        },
      };
    },
    // Per-RFQ countdown: the REAL createRfqCountdownMachine, exercising the
    // relocated countdown logic through the same useMachine bridge the app uses.
    // Contract specs drive the countdown with fake timers.
    useRfqCountdown: (creationTimestamp: number, totalMs: number) => {
      return useMachine(() => {
        return createRfqCountdownMachine(creationTimestamp, totalMs);
      }).state;
    },
    // Animation intents: backed by the World's per-target intent subject so the
    // AnimationIntents.contract.spec can push synthetic intents and assert the
    // data-anim mapping without wiring a real AnimationDirector.
    useAnimationIntents: (target: string) => {
      return useSubject(world.intentFor(target));
    },
    // Layout: the REAL per-tab createLayoutMachine SINGLETON (Task 12/P5,
    // getLayoutFor above) rather than a fresh per-mount instance — a driven
    // "layout" DriveCommand and a mounted AppShell's own useLayout(tab) now
    // read/write the SAME machine, mirroring composition.ts's layoutFor.
    useLayout: (tab: WorkspaceTab) => {
      const machine = getLayoutFor(world, tab);
      const state = useMachineState(machine.state$);
      return { state, ...machine.intents };
    },
    // Boot sequence: no contract spec exercises the boot sequence in Phase 2;
    // use the REAL machine with a fixed "core" variant and noop advance so it
    // compiles and disposes cleanly without touching real preferences.
    useBootSequence: (onDone: () => void) => {
      return useMachine(() => {
        return createBootSequenceMachine({
          variant: "core",
          advance: () => {},
          onDone,
        });
      });
    },
    // Equities: reactive views backed by the World's shared streams (watchlist /
    // orders / positions) and per-symbol subjects (quote / candles / depth) — so a
    // spec seeding `equities: { watchlist, quotes, orders, … }` re-renders the
    // subscribing panel, mirroring the real createViewModel binds.
    useWatchlist: () => {
      return useSubject(world.watchlist);
    },
    useEquityQuote: (symbol: string) => {
      return useSubject(world.equityQuoteFor(symbol));
    },
    useCandles: (symbol: string) => {
      return useSubject(world.candlesFor(symbol));
    },
    // Candle backfill: static default — no current contract spec drives
    // backfill through World (ChartBackfill.contract.spec.ts mounts
    // CandleChart directly with props instead), so a constant value plus a
    // no-op command is sufficient to satisfy the interface.
    useCandleBackfill: (_symbol: string, _timeframe?: CandleTimeframe) => {
      return { loadingOlder: false, historyExhausted: false };
    },
    loadOlderCandles: (): void => {
      return;
    },
    useDepth: (symbol: string) => {
      return useSubject(world.depthFor(symbol));
    },
    useEquityOrders: () => {
      return useSubject(world.equityOrders);
    },
    useEquityPositions: () => {
      return useSubject(world.equityPositions);
    },
    // Machine: the REAL createOrderTicketMachine, driven by a World-backed place()
    // that returns the lifecycle Subject. A spec drives setQty/submit through the
    // ticket's intents (editing→submitting), then pushOrderLifecycle emits
    // working/partiallyFilled/filled orders — exercising the relocated place
    // lifecycle through the same useMachine bridge the app uses.
    useOrderTicket: (defaultSymbol: string) => {
      return useMachine(() => {
        return createOrderTicketMachine({
          place: (req: PlaceOrderRequest) => {
            world.commands.placedOrderRequests.push(req);
            return world.orderLifecycle.asObservable();
          },
          defaultSymbol,
        });
      });
    },
    // Eq workspace: the REAL createEqWorkspaceMachine, one shared instance for
    // the whole World (world.eqWorkspace) — NOT a per-mount useMachine, so
    // every component reading useEqWorkspace() through this World observes the
    // same selection/open-tabs/timeframe, mirroring the app's composition-root
    // singleton wiring.
    useEqWorkspace: () => {
      const state = useMachineState(world.eqWorkspace.state$);
      return {
        state,
        select: world.eqWorkspace.intents.select,
        closeTab: world.eqWorkspace.intents.closeTab,
        setTimeframe: world.eqWorkspace.intents.setTimeframe,
        setChartType: world.eqWorkspace.intents.setChartType,
        toggleIndicator: world.eqWorkspace.intents.toggleIndicator,
        togglePane: world.eqWorkspace.intents.togglePane,
        toggleYScale: world.eqWorkspace.intents.toggleYScale,
        setCompare: world.eqWorkspace.intents.setCompare,
      };
    },
    // Eq drawings: the REAL createEqDrawingsMachine, one shared instance for
    // the whole World (world.eqDrawings) — mirrors useEqWorkspace above,
    // NOT a per-mount useMachine, so the chart head's draw-tool pills and
    // the plot's committed drawings, even mounted via separate mountWith()
    // calls sharing one World, observe the same tool/drawings/selection.
    useEqDrawings: () => {
      const state = useMachineState(world.eqDrawings.state$);
      return {
        state,
        setTool: world.eqDrawings.intents.setTool,
        addDrawing: world.eqDrawings.intents.addDrawing,
        selectDrawing: world.eqDrawings.intents.selectDrawing,
        deleteSelected: world.eqDrawings.intents.deleteSelected,
        shiftAnchors: world.eqDrawings.intents.shiftAnchors,
        updateDrawing: world.eqDrawings.intents.updateDrawing,
      };
    },
    // Jarvis: the REAL createJarvisMachine (Task 9), cached once per World
    // (getJarvisMachine above) and bridged through useMachineState exactly
    // like the shared eqWorkspace machine above — so JarvisOrb and
    // JarvisOverlay, even mounted via separate mountWith() calls sharing one
    // World, observe the same open/phase/entries/pendingConfirmation.
    useJarvis: () => {
      const machine = getJarvisMachine(world);
      const state = useMachineState(machine.state$);
      return { state, ...machine.intents };
    },
    // The two Jarvis desk-assistant preferences (Task 10): reactive reads
    // off World.jarvisBrain/jarvisEffort, writes recorded so a spec can
    // assert what the user actually chose — mirrors useLoginWaitPreferences
    // exactly, and feeds the SAME subjects getJarvisMachine's
    // preferredBrain$/effort$ read above, so a write through this seam
    // re-resolves the real machine's effectiveBrain.
    useJarvisPreferences: () => {
      return {
        brain: useSubject(world.jarvisBrain),
        setBrain: (brain: JarvisBrain) => {
          world.commands.jarvisBrainSets.push(brain);
          world.jarvisBrain.next(brain);
        },
        effort: useSubject(world.jarvisEffort),
        setEffort: (effort: JarvisEffort) => {
          world.commands.jarvisEffortSets.push(effort);
          world.jarvisEffort.next(effort);
        },
        narrator: useSubject(world.jarvisNarrator),
        setNarrator: (preference: JarvisNarratorPreference) => {
          world.commands.jarvisNarratorSets.push(preference);
          world.jarvisNarrator.next(preference);
        },
      };
    },
    // Jarvis token-usage/cost telemetry (Task 10): reactive view backed by
    // the World subject, mirroring useTopology.
    useJarvisUsage: () => {
      return useSubject(world.jarvisUsage$);
    },
    // Generative-UI desk panels (Task 9): the REAL JarvisPanelsPresenter,
    // fed by the same jarvis.events$ the REAL JarvisMachine above emits —
    // see getJarvisPanelsBridge's doc for the full wiring.
    useJarvisPanels: () => {
      const bridge = getJarvisPanelsBridge(world);
      return {
        panels: useSubject(bridge.panels$),
        dismissPanel: bridge.dismissPanel,
      };
    },
    useJarvisPanelData: (panelId: string) => {
      const bridge = getJarvisPanelsBridge(world);
      return useSubject(bridge.panelData$(panelId));
    },
    // Jarvis drive-the-app interpreter's outcomes (Task 12/P5): the REAL
    // createJarvisDriverMachine (getJarvisDriverMachine above), one shared
    // instance per World — a driven batch's lastBatch is now genuinely
    // observable, including by HeaderChrome's/AppShell's own driven-pulse
    // cue (useJarvisDrivenPulse.ts).
    useJarvisDriver: () => {
      const driver = getJarvisDriverMachine(world);
      return useMachineState(driver.state$);
    },
    useJarvisDemo: () => {
      const demo = getJarvisDemoMachine(world);
      return {
        state: useMachineState(demo.state$),
        ...demo.intents,
      };
    },
    // The app's active workspace tab (Task 12/P5): the REAL
    // createWorkspaceNavMachine SINGLETON (getWorkspaceNav above), mirroring
    // composition.ts's promoted workspaceNav — reachable now from a driven
    // "switchTab" command, and shared by every component reading
    // useWorkspaceNav() through this World (e.g. a mounted AppShell).
    useWorkspaceNav: () => {
      const machine = getWorkspaceNav(world);
      const state = useMachineState(machine.state$);
      return { state, switchTab: machine.intents.switchTab };
    },
    // Admin / telemetry (Phase 5): World-backed fakes that re-render subscribing
    // components when the test pushes new data. The incident fake mirrors the real
    // IncidentMachine's connection-status asymmetry via world.injectIncident.
    useMetrics: () => {
      return useSubject(world.metrics$);
    },
    useTopology: () => {
      return useSubject(world.topology$);
    },
    useEventLog: () => {
      return useSubject(world.eventLog$);
    },
    useSessions: () => {
      return useSubject(world.sessions$);
    },
    useSessionCountSeries: () => {
      return useSubject(world.sessionCountSeries$);
    },
    useIncident: () => {
      const state = useSubject(world.incidentState$);
      return {
        state,
        inject: (kind: Parameters<typeof world.injectIncident>[0]) => {
          world.injectIncident(kind);
        },
        clear: () => {
          world.clearIncident();
        },
      };
    },
  };
}
