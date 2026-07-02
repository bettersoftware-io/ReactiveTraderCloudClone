import { expect, jest, test } from "@jest/globals";
import { firstValueFrom } from "rxjs";

import { AppearanceColorSchemeAdapter } from "#/app/adapters/AppearanceColorSchemeAdapter";

test("seeds prefersDark from the current OS scheme", async () => {
  const appearance = mockAppearance("dark");
  const adapter = new AppearanceColorSchemeAdapter(appearance);
  expect(await firstValueFrom(adapter.prefersDark$())).toBe(true);
});

test("emits false when the OS reports light or null", async () => {
  const adapter = new AppearanceColorSchemeAdapter(mockAppearance(null));
  expect(await firstValueFrom(adapter.prefersDark$())).toBe(false);
});

test("pushes a new value when the OS scheme changes", async () => {
  const appearance = mockAppearance("light");
  const adapter = new AppearanceColorSchemeAdapter(appearance);
  const seen: boolean[] = [];
  const sub = adapter.prefersDark$().subscribe((v) => {
    seen.push(v);
  });
  appearance.emit("dark");
  sub.unsubscribe();
  expect(seen).toEqual([false, true]);
});

interface ColorSchemePref {
  colorScheme: "dark" | "light" | null;
}

type ChangeListener = (pref: ColorSchemePref) => void;

interface RemoveHandle {
  remove: jest.Mock;
}

interface MockAppearance {
  getColorScheme: jest.Mock<() => "dark" | "light" | null>;
  addChangeListener: jest.Mock<(cb: ChangeListener) => RemoveHandle>;
  emit: (scheme: "dark" | "light" | null) => void;
}

function mockAppearance(initial: "dark" | "light" | null): MockAppearance {
  let listener: ChangeListener | null = null;
  return {
    getColorScheme: jest.fn(() => {
      return initial;
    }),
    addChangeListener: jest.fn((cb: ChangeListener) => {
      listener = cb;
      return { remove: jest.fn() };
    }),
    emit: (scheme: "dark" | "light" | null): void => {
      listener?.({ colorScheme: scheme });
    },
  };
}
