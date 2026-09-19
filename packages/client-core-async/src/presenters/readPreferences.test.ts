import { BehaviorSubject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type BootVariant,
  type EqWatchlistSort,
  type PreferencesPort,
  PreferencesSimulator,
} from "@rtc/domain";

import {
  createBootPreferencePresenter,
  createEqWatchlistSortPreferencePresenter,
} from "#/presenters/readPreferences";

describe("createEqWatchlistSortPreferencePresenter (async)", () => {
  it("cycle() advances from the value the PORT holds now, even one written behind the presenter's back", () => {
    const preferences = new PreferencesSimulator({ eqWatchlistSort: "chg" });
    const presenter = createEqWatchlistSortPreferencePresenter(preferences);
    const seen: EqWatchlistSort[] = [];
    const sub = preferences.eqWatchlistSort$().subscribe((sort) => {
      seen.push(sort);
    });
    // Not through the presenter: a presenter that cached its own last
    // `setSort` would advance from "chg" here and land on "price".
    preferences.setEqWatchlistSort("price");
    presenter.cycle();
    expect(seen).toEqual(["chg", "price", "sym"]);
    sub.unsubscribe();
  });

  it("cycle() leaves nothing warm on the port", () => {
    const subject = new BehaviorSubject<EqWatchlistSort>("sym");
    const presenter = createEqWatchlistSortPreferencePresenter(
      createPortWithEqWatchlistSort(subject),
    );
    presenter.cycle();
    expect(subject.observed).toBe(false);
  });
});

describe("createBootPreferencePresenter (async)", () => {
  it("current() reads the value the PORT holds now, even one written behind the presenter's back", () => {
    const preferences = new PreferencesSimulator({ bootVariant: "core" });
    const presenter = createBootPreferencePresenter(preferences);
    expect(presenter.current()).toBe("core");
    preferences.setBootVariant("laser");
    expect(presenter.current()).toBe("laser");
  });

  it("current() leaves nothing warm on the port", () => {
    const subject = new BehaviorSubject<BootVariant>("geo");
    const presenter = createBootPreferencePresenter(
      createPortWithBootVariant(subject),
    );
    expect(presenter.current()).toBe("geo");
    expect(subject.observed).toBe(false);
  });
});

/** A real simulator whose `eqWatchlistSort$` returns the CALLER's subject —
 * the Proxy shape `themePreference.test.ts` uses, for the same reason
 * (TypeScript drops a class's methods from an object spread). */
function createPortWithEqWatchlistSort(
  subject: BehaviorSubject<EqWatchlistSort>,
): PreferencesPort {
  return new Proxy(new PreferencesSimulator(), {
    get: (
      target: PreferencesSimulator,
      property: string | symbol,
      receiver: unknown,
    ) => {
      if (property === "eqWatchlistSort$") {
        return () => {
          return subject;
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

function createPortWithBootVariant(
  subject: BehaviorSubject<BootVariant>,
): PreferencesPort {
  return new Proxy(new PreferencesSimulator(), {
    get: (
      target: PreferencesSimulator,
      property: string | symbol,
      receiver: unknown,
    ) => {
      if (property === "bootVariant$") {
        return () => {
          return subject;
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}
