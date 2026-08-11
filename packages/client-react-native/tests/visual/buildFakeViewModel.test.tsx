import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "@jest/globals";

import { buildFakeViewModel } from "./buildFakeViewModel";
import { analyticsSlice } from "./fake/analytics";
import { blotterSlice } from "./fake/blotter";
import { creditSlice } from "./fake/credit";
import { equitiesSlice } from "./fake/equities";
import { inertSlice } from "./fake/inert";
import { ratesSlice } from "./fake/rates";
import { buildShellSlice } from "./fake/shell";

/** The directory holding every slice module — scanned whole, so a slice added
 * later is guarded without anyone remembering to list it. */
const FAKE_DIR = join(__dirname, "fake");

/** The one guarded module outside `fake/`. Deliberately named rather than
 * scanning this directory: `tests/visual/` also holds the capture driver and
 * the simctl runner, which use `setTimeout` legitimately and must not be
 * swept into a guard about the fake's fixtures. */
const GUARDED_SIBLING = "buildFakeViewModel.ts";

/** A clock or an RNG anywhere in the fake defeats its entire purpose. */
const LIVE_SOURCE_PATTERN =
  /Date\.now|Math\.random|setInterval|setTimeout|\binterval\(/;

/**
 * The total member count on `ViewModel`, partitioned across the seven slices.
 *
 * 68, not 67: `loadOlderCandles` is a bare command rather than a `use*` hook,
 * and a hand-written census that assumed the `use` prefix missed it while
 * reporting a confident 67 of 67.
 */
const VIEW_MODEL_MEMBER_COUNT = 68;

describe("buildFakeViewModel", () => {
  test("returns identical values across instances — the whole point of the fake", () => {
    const a = buildFakeViewModel();
    const b = buildFakeViewModel();

    expect(a.useConnectionStatus()).toEqual(b.useConnectionStatus());
    expect(a.useTrades()).toEqual(b.useTrades());
    expect(a.useCurrencyPairs()).toEqual(b.useCurrencyPairs());
    expect(a.useWatchlist()).toEqual(b.useWatchlist());
    expect(a.useCandles("AAPL")).toEqual(b.useCandles("AAPL"));
  });

  test("returns the same value on repeated reads within one instance", () => {
    // A hook backed by a live stream would differ between two reads; a
    // snapshot cannot. This is the assertion that fails if anyone reintroduces
    // one. `toBe` rather than `toEqual` deliberately — a hook that rebuilt its
    // value per call would still pass a deep-equality check today, and would
    // be the natural place for someone to later compute it from a clock.
    const vm = buildFakeViewModel();

    expect(vm.useTrades()).toBe(vm.useTrades());
    expect(vm.useCurrencyPairs()).toBe(vm.useCurrencyPairs());
    expect(vm.useWatchlist()).toBe(vm.useWatchlist());
    expect(vm.useCandles("AAPL")).toBe(vm.useCandles("AAPL"));
  });

  test("intents are no-ops that do not throw — screenshots never press buttons", () => {
    const vm = buildFakeViewModel();

    expect(() => {
      vm.useReconnect()();
      vm.usePowerSaver().cycle();
      vm.useThemePreference().cycle();
      vm.useOrderTicket("AAPL").submit();
      vm.useTileExecution(vm.useCurrencyPairs()[0]).dismiss();
    }).not.toThrow();
  });

  test("an intent does not change what a later read returns", () => {
    const vm = buildFakeViewModel();
    const before = vm.useThemeSkinPreference().skin;

    vm.useThemeSkinPreference().setSkin("neon");

    expect(vm.useThemeSkinPreference().skin).toBe(before);
  });

  test("shell options thread through to the hooks that read them", () => {
    const vm = buildFakeViewModel({ skin: "neon", mode: "light" });

    expect(vm.useThemeSkinPreference().skin).toBe("neon");
    expect(vm.useThemePreference().mode).toBe("light");
  });

  test("an override replaces exactly one hook and leaves the rest at defaults", () => {
    const base = buildFakeViewModel();
    const overridden = buildFakeViewModel({
      overrides: {
        useTrades: () => {
          return [];
        },
      },
    });

    expect(overridden.useTrades()).toEqual([]);
    expect(overridden.useCurrencyPairs()).toEqual(base.useCurrencyPairs());
  });
});

describe("the slice partition", () => {
  test("covers every ViewModel member exactly once", () => {
    const keys = allSliceKeys();

    expect(keys).toHaveLength(VIEW_MODEL_MEMBER_COUNT);
    expect(new Set(keys).size).toBe(VIEW_MODEL_MEMBER_COUNT);
  });

  test("no hook is claimed by two slices", () => {
    // TypeScript cannot catch this: a duplicate key just means one spread
    // silently overwrites the other, so a meaningful fixture could be replaced
    // by an inert placeholder from a later slice with the build staying green.
    const keys = allSliceKeys();
    const duplicates = keys.filter((key, index) => {
      return keys.indexOf(key) !== index;
    });

    expect(duplicates).toEqual([]);
  });

  test("the composed ViewModel exposes every partitioned hook", () => {
    const vm = buildFakeViewModel();

    for (const key of allSliceKeys()) {
      expect(typeof vm[key]).toBe("function");
    }
  });
});

describe("determinism guard", () => {
  test("no fake module reads a clock or an RNG", () => {
    const offenders = guardedSources().filter(({ source }) => {
      return LIVE_SOURCE_PATTERN.test(source);
    });

    expect(
      offenders.map(({ name }) => {
        return name;
      }),
    ).toEqual([]);
  });

  test("the guard actually scanned the fake modules", () => {
    // Without this, a glob that stopped matching — a moved directory, a
    // renamed suffix — would leave the test above asserting `[] === []` and
    // reporting green over an unscanned tree. A guard that cannot fail is
    // worse than no guard, because it is believed.
    const names = guardedSources().map(({ name }) => {
      return name;
    });

    expect(names).toContain("buildFakeViewModel.ts");
    expect(names).toContain("equities.ts");
    expect(names).toContain("shell.ts");
    expect(names.length).toBeGreaterThanOrEqual(9);
  });
});

function allSliceKeys(): readonly (keyof ReturnType<
  typeof buildFakeViewModel
>)[] {
  return [
    buildShellSlice(),
    blotterSlice,
    ratesSlice,
    creditSlice,
    equitiesSlice,
    analyticsSlice,
    inertSlice,
  ].flatMap((slice) => {
    return Object.keys(slice);
  }) as (keyof ReturnType<typeof buildFakeViewModel>)[];
}

function guardedSources(): readonly GuardedSource[] {
  const sliceSources = readdirSync(FAKE_DIR)
    .filter((name) => {
      return name.endsWith(".ts") && !name.includes(".test.");
    })
    .map((name) => {
      return { name, source: readCode(join(FAKE_DIR, name)) };
    });

  return [
    {
      name: GUARDED_SIBLING,
      source: readCode(join(__dirname, GUARDED_SIBLING)),
    },
    ...sliceSources,
  ];
}

/**
 * A module's source with its comments removed.
 *
 * Comments must be stripped, not scanned: these files EXPLAIN why a clock is
 * forbidden, and naming the banned calls in that explanation is the clearest
 * way to write it. Matching raw text would force the documentation to talk
 * around the very thing it is about — and the first person to hit that would
 * reasonably conclude the guard was broken and weaken it.
 *
 * The line-comment strip also eats anything after a `//` inside a string
 * literal (a URL, say). That can only ever make the guard scan LESS text,
 * never invent a violation; no fixture here holds a URL today, and a clock
 * hidden behind one would be a deliberate act rather than an accident.
 */
function readCode(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

interface GuardedSource {
  readonly name: string;
  readonly source: string;
}
