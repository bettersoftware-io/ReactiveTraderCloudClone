// packages/client-core-rxjs/src/composition.dispose.test.ts
//
// `app.dispose()`'s ownership half. The `@rtc/core-contract` `dispose` suite
// (run by `composition.coreContract.test.ts`) witnesses what every core
// promises from outside — no port stream stays subscribed. It cannot see
// the RxJS core's INTERNAL holds: the state mirrors and kicks `createApp`
// opens on machines it owns hold no port, and the machines it disposes are
// masked by `warmReplay`'s own release. So this file wraps every machine
// factory `createApp` calls, and witnesses the two halves directly: every
// owned machine's `dispose`/`stop` runs, and nothing still subscribes any
// owned machine's streams afterwards.

import { NEVER, Observable } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSimulatorPorts, InMemorySessionStore } from "@rtc/client-core";
import { createFakeConnectionPorts } from "@rtc/client-core/testing";
import type { JarvisDemoState, StoredSession } from "@rtc/core-api";
import { collect, scriptPorts } from "@rtc/core-contract";
import { LAYOUT_PANEL_IDS } from "@rtc/core-logic";
import {
  AuthSimulator,
  PreferencesSimulator,
  ROSTER,
  WORKSPACE_PERSIST_DEBOUNCE_MS,
} from "@rtc/domain";

import { createApp } from "#/composition";

/** Every factory call `createApp` makes, by name, with the teardowns it
 * made and the live subscriptions on the streams it returned. */
const owned = vi.hoisted(() => {
  return {
    teardowns: new Map<string, number>(),
    live: new Map<string, number>(),
  };
});

beforeEach(() => {
  owned.teardowns.clear();
  owned.live.clear();
});

describe("createApp().dispose — what the composition owns", () => {
  it("disposes every machine it owns and leaves none of their streams subscribed", async () => {
    const { ports, teardown } = scriptPorts(createBasePorts(), {
      transport: true,
      session: createStoredSession(),
    });
    const app = createApp(ports);

    try {
      // Both layout singletons exist only once a tab asks for one.
      app.presenters.layoutFor("fx");
      app.presenters.layoutFor("equities");
      const reader = collect(app.presenters.jarvisPanels.panels$);
      reader.unsubscribe();
      // A positive witness first: composition holds its mirrors now, so a
      // zero afterwards is a release, not a counter nobody fed.
      // (The workspace singletons have no mirror: only their dispose is
      // composition's.)
      expect(liveHolds()).toEqual({
        jarvis: 1,
        jarvisPanels: 3,
        "jarvisDriver.outcomes": 1,
        layout: 4,
        workspaceNav: 1,
      });

      await app.dispose();

      expect(Object.fromEntries(owned.teardowns)).toEqual({
        eqDrawings: 1,
        eqWorkspace: 1,
        incident: 1,
        jarvis: 1,
        jarvisPanelsPresenter: 1,
        layout: 2,
        narrator: 1,
        workspaceNav: 1,
      });
      expect(
        Object.values(liveHolds()).every((count) => {
          return count === 0;
        }),
      ).toBe(true);
    } finally {
      teardown();
    }
  });
});

describe("createApp().dispose — the Jarvis demo run", () => {
  it("a demo run in progress at dispose leaves no timer behind", async () => {
    vi.useFakeTimers();

    try {
      const { ports, teardown } = scriptPorts(createBasePorts());
      const app = createApp(ports);

      try {
        app.presenters.jarvisDemo.intents.startDemo();
        await vi.advanceTimersByTimeAsync(0);
        // A positive witness first: the run is live and its step watchdog is
        // armed.
        expect(readDemoRunning(app.presenters.jarvisDemo.state$)).toBe(true);
        expect(vi.getTimerCount()).toBeGreaterThan(0);

        await app.dispose();
        await vi.advanceTimersByTimeAsync(0);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        teardown();
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createApp().dispose — the debounced workspace writer", () => {
  it("a layout write still pending at dispose never lands", async () => {
    vi.useFakeTimers();

    try {
      const { ports, driver, teardown } = scriptPorts(createBasePorts());
      const app = createApp(ports);

      try {
        const [first, second] = LAYOUT_PANEL_IDS.fx;
        const layout = app.presenters.layoutFor("fx");
        // A positive witness first: a change writes once the debounce lapses.
        layout.intents.maximize(first);
        await vi.advanceTimersByTimeAsync(WORKSPACE_PERSIST_DEBOUNCE_MS);
        const written = driver.storedWorkspaceLayout();
        expect(written).not.toBeNull();

        layout.intents.maximize(second);
        await app.dispose();
        await vi.advanceTimersByTimeAsync(WORKSPACE_PERSIST_DEBOUNCE_MS);
        expect(driver.storedWorkspaceLayout()).toBe(written);
      } finally {
        teardown();
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

/** The demo's `running` flag now, read through a fresh subscriber. */
function readDemoRunning(state$: Observable<JarvisDemoState>): boolean {
  let running = false;
  state$
    .subscribe((state) => {
      running = state.running;
    })
    .unsubscribe();

  return running;
}

/** Live subscriptions per owned stream, keys sorted for a stable
 * `toEqual`. */
function liveHolds(): Record<string, number> {
  return Object.fromEntries(
    [...owned.live].sort(([a], [b]) => {
      return a.localeCompare(b);
    }),
  );
}

function createBasePorts(): Parameters<typeof scriptPorts>[0] {
  return {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator({}),
      auth: new AuthSimulator({ demo: "pw" }),
      sessionStore: new InMemorySessionStore(),
    }),
    ...createFakeConnectionPorts({
      events: () => {
        return NEVER;
      },
    }),
  };
}

function createStoredSession(): StoredSession {
  const [first] = ROSTER;

  return {
    token: "t",
    user: first.user,
    username: first.username,
    exp: Date.now() + 3_600_000,
  };
}

vi.mock("#/presenters/index", async (importOriginal) => {
  const original = await importOriginal<typeof import("#/presenters/index")>();

  function countTeardown(name: string, teardown: () => void): () => void {
    return () => {
      owned.teardowns.set(name, (owned.teardowns.get(name) ?? 0) + 1);
      teardown();
    };
  }

  function countStream<T>(name: string, source: Observable<T>): Observable<T> {
    return new Observable<T>((subscriber) => {
      owned.live.set(name, (owned.live.get(name) ?? 0) + 1);
      const inner = source.subscribe(subscriber);

      return () => {
        owned.live.set(name, (owned.live.get(name) ?? 0) - 1);
        inner.unsubscribe();
      };
    });
  }

  /** `create` with its result's `state$` counted and `dispose` recorded. */
  function ownMachine<A extends unknown[], M extends { dispose(): void }>(
    name: string,
    create: (...args: A) => M,
  ): (...args: A) => M {
    return (...args: A): M => {
      const machine = create(...args);
      const counted = {
        ...machine,
        dispose: countTeardown(name, machine.dispose),
      };

      if ("state$" in machine) {
        Object.assign(counted, {
          state$: countStream(name, machine.state$ as Observable<unknown>),
        });
      }

      return counted;
    };
  }

  class CountedJarvisPanelsPresenter extends original.JarvisPanelsPresenter {
    override dispose(): void {
      countTeardown("jarvisPanelsPresenter", () => {
        super.dispose();
      })();
    }
  }

  return {
    ...original,
    JarvisPanelsPresenter: CountedJarvisPanelsPresenter,
    createJarvisMachine: ownMachine("jarvis", original.createJarvisMachine),
    createLayoutMachine: ownMachine("layout", original.createLayoutMachine),
    createWorkspaceNavMachine: ownMachine(
      "workspaceNav",
      original.createWorkspaceNavMachine,
    ),
    createEqWorkspaceMachine: ownMachine(
      "eqWorkspace",
      original.createEqWorkspaceMachine,
    ),
    createIncidentMachine: ownMachine(
      "incident",
      original.createIncidentMachine,
    ),
    createEqDrawingsMachine: ownMachine(
      "eqDrawings",
      original.createEqDrawingsMachine,
    ),
    createNarratorMachine: (
      ...args: Parameters<typeof original.createNarratorMachine>
    ) => {
      const narrator = original.createNarratorMachine(...args);
      return { stop: countTeardown("narrator", narrator.stop) };
    },
    // No dispose of their own: only the streams `createApp` subscribes are
    // counted.
    createJarvisPanelsMachine: (
      ...args: Parameters<typeof original.createJarvisPanelsMachine>
    ) => {
      const machine = original.createJarvisPanelsMachine(...args);
      return {
        ...machine,
        state$: countStream("jarvisPanels", machine.state$),
      };
    },
    createJarvisDriverMachine: (
      ...args: Parameters<typeof original.createJarvisDriverMachine>
    ) => {
      const machine = original.createJarvisDriverMachine(...args);
      return {
        ...machine,
        outcomes$: countStream("jarvisDriver.outcomes", machine.outcomes$),
      };
    },
  };
});
