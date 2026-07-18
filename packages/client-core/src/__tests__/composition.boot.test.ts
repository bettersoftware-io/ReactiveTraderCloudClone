import { describe, expect, it } from "vitest";

import { type BootVariant, PreferencesSimulator } from "@rtc/domain";

import { createMachineFactories, type Presenters } from "#/composition";
import { BootPreferencePresenter } from "#/presenters/index";

describe("boot machine factory", () => {
  it("boot factory exists on MachineFactories", () => {
    const fakePref = new PreferencesSimulator({ bootVariant: "core" });
    const bootPreference = new BootPreferencePresenter(fakePref);
    const presenters = { bootPreference } as unknown as Presenters;
    const factories = createMachineFactories(presenters);

    expect(typeof factories.boot).toBe("function");
  });

  it("boot factory advances the persisted variant via the preferences seam", () => {
    // Seed the preferences port at "core" — so the machine should advance to "laser".
    const fakePref = new PreferencesSimulator({ bootVariant: "core" });
    const setBootVariantCalls: string[] = [];

    // Spy on setBootVariant without breaking the BehaviorSubject chain.
    const origSet = fakePref.setBootVariant.bind(fakePref);

    fakePref.setBootVariant = (v: BootVariant): void => {
      setBootVariantCalls.push(v);
      origSet(v);
    };

    const bootPreference = new BootPreferencePresenter(fakePref);
    // createMachineFactories only reads presenters.bootPreference in the boot factory.
    const presenters = { bootPreference } as unknown as Presenters;
    const factories = createMachineFactories(presenters);

    // Constructing the machine calls deps.advance(nextVariant) synchronously.
    const m = factories.boot(() => {});

    expect(setBootVariantCalls).toEqual(["laser"]);

    m.dispose();
  });

  it("boot factory seeded at 'laser' advances to 'docking'", () => {
    const fakePref = new PreferencesSimulator({ bootVariant: "laser" });
    const calls: string[] = [];
    const origSet = fakePref.setBootVariant.bind(fakePref);

    fakePref.setBootVariant = (v: BootVariant): void => {
      calls.push(v);
      origSet(v);
    };

    const bootPreference = new BootPreferencePresenter(fakePref);
    const presenters = { bootPreference } as unknown as Presenters;
    const m = createMachineFactories(presenters).boot(() => {});

    expect(calls).toEqual(["docking"]);
    m.dispose();
  });

  it("boot factory emits initial state synchronously", () => {
    const fakePref = new PreferencesSimulator({ bootVariant: "core" });
    const bootPreference = new BootPreferencePresenter(fakePref);
    const presenters = { bootPreference } as unknown as Presenters;
    const m = createMachineFactories(presenters).boot(() => {});

    let seen:
      | import("#/presenters/BootSequenceMachine").BootSequenceState
      | undefined;

    const sub = m.state$.subscribe((s) => {
      seen = s;
    });
    sub.unsubscribe();

    expect(seen).toBeDefined();
    expect(seen?.variant).toBe("core");
    expect(seen?.done).toBe(false);
    m.dispose();
  });
});
