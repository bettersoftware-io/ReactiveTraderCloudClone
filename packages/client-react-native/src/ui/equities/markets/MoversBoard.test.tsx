import { afterEach, expect, jest, test } from "@jest/globals";

import { moversBoardPage } from "#tests/pages/MoversBoardPage";

// The holo/dark theme's accent tokens (`renderWithTheme`'s default) —
// `useRankMoveGlide`'s tint shared value seeds at `riseColor`
// (`accentPositive`), so only a genuine "fell" classification (which needs
// the row's PREVIOUS rank remembered across the re-sort) can turn it
// `accentNegative`. A remounted row's fresh `prevRankRef` would read
// "unchanged" instead and leave the tint at its green seed — indistinguishable
// from "never moved" if the witness color were `accentPositive` instead.
const ACCENT_NEGATIVE = "#ff5d73";

const page = moversBoardPage();

afterEach(() => {
  return page.unmountAll();
});

test("ranks by change% under the chg sort — the mover leads", async () => {
  await page.mount("chg");
  expect(page.ranksInOrder()).toEqual(["01", "02"]);
  expect(page.rankOf("TSLA")).toBe("01");
});

test("re-sorting by symbol renumbers without losing a row's rank-move state", async () => {
  await page.mount("chg");
  // Under "chg", TSLA (+1.13%) leads AAPL (-1.06%): TSLA rank 01, AAPL 02.
  expect(page.rankOf("TSLA")).toBe("01");

  // Re-sort to "sym": AAPL (rank 01) now leads TSLA (rank 02) — TSLA's rank
  // NUMBER increases (a "fell" move), which renumbers correctly under either
  // keying scheme and so proves nothing about remounting on its own.
  await page.rerenderSortedBySym();
  await page.rerenderSortedBySym();
  expect(page.rankOf("AAPL")).toBe("01");

  // The actual non-remount proof: TSLA's row only correctly classifies its
  // own rank 1 → 2 move as "fell" (tinting `accentNegative`) if the SAME
  // component instance — and so its internal `useRankMoveGlide` `prevRank`
  // ref — survived the re-sort. `key={row.symbol}` (MoversBoard.tsx) is what
  // keeps it the same instance.
  expect(page.glowBackgroundOf("TSLA")).toBe(ACCENT_NEGATIVE);
});

test("renders an empty state rather than a bare list", async () => {
  await page.mountEmpty();
  expect(page.exists("eq-movers-empty")).toBe(true);
});

// The `!motionEnabled` branch (MoversBoard.tsx) renders a materially
// different tree — a plain `View`, no `LinearTransition`/`FadeIn`/`FadeOut`,
// and no `eq-mover-*-glow` overlay at all — which every OTHER test in this
// file never exercises (they all get the `true` default below). This is also
// the tree the `equities/markets` visual golden actually captures: that
// scenario seeds `powerSaverLevel="freeze"`, under which
// `useShellMotionEnabled` returns false.
test("renders static rows with no glow overlay when motion is disabled", async () => {
  // `mockReturnValue` (not `-Once`): MoversBoardRow's `onQuote` effect fires
  // synchronously after mount and re-renders MoversBoard, which reads
  // `useShellMotionEnabled()` a second time — a `-Once` stub would answer
  // that second call with the mock's default (`true`) and silently exercise
  // the wrong branch.
  mockMotionEnabled.mockReturnValue(false);
  await page.mount("chg");
  expect(page.exists("eq-mover-AAPL")).toBe(true);
  expect(page.exists("eq-mover-TSLA")).toBe(true);
  expect(page.glowCount()).toBe(0);
  mockMotionEnabled.mockReturnValue(true);
});

// `page.mount()` doesn't stub `usePowerSaver`; each row's `useRankMoveGlide`
// reads it via `useShellMotionEnabled`. These tests assert ranking/empty-state,
// not motion behaviour, so — mirroring InstrumentCard.test.tsx/SpotTile.test.tsx
// — the hook is stubbed directly rather than widening the ViewModel stub. A
// partial ViewModel through `ViewModelProvider` crashes with `TypeError:
// usePowerSaver is not a function` otherwise (a known trap this phase — see
// SpotTile.test.tsx/InstrumentCard.test.tsx for the same fix).
//
// A toggleable `jest.fn` (not a hardcoded `true`, mirroring
// `OrderCeremony.test.tsx`'s mock) — the previous constant-`true` mock could
// never exercise the `!motionEnabled` branch above, which is the tree the
// registered `equities/markets` visual golden actually renders.
const mockMotionEnabled = jest.fn<() => boolean>(() => {
  return true;
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return mockMotionEnabled();
    },
  };
});
