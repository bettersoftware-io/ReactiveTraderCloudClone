import { cleanup, render, screen } from "@testing-library/react";

import type { JarvisUsageSnapshot } from "@rtc/client-core";
import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

import { JarvisUsageCard } from "#/ui/admin/jarvis/JarvisUsageCard";

export interface JarvisUsageCardPage {
  mount(usage: JarvisUsageSnapshot | null): void;
  unmountAll(): void;
  exists(testId: string): boolean;
  text(testId: string): string;
  attribute(testId: string, name: string): string | null;
}

/** The framework surface for `JarvisUsageCard.test.tsx`. */
export function jarvisUsageCardPage(): JarvisUsageCardPage {
  return {
    mount(usage: JarvisUsageSnapshot | null): void {
      const hooks = {
        useJarvisUsage: () => {
          return usage;
        },
      } as unknown as ViewModel;

      render(
        <ViewModelContext.Provider value={hooks}>
          <JarvisUsageCard />
        </ViewModelContext.Provider>,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    text(testId: string): string {
      return screen.getByTestId(testId).textContent ?? "";
    },
    attribute(testId: string, name: string): string | null {
      return screen.getByTestId(testId).getAttribute(name);
    },
  };
}
