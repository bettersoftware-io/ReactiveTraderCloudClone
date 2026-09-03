import { cleanup, render, screen } from "@testing-library/react";

import type { SerializedValue } from "@rtc/devtools-core";

import { ValueView } from "#/panels/ValueView";

export interface ValueViewPage {
  mountValueView(value: SerializedValue): void;
  unmountAll(): void;
  hasText(text: string): boolean;
  titledMarkerText(title: string): string;
}

/** The framework surface for `ValueView.test.tsx`. */
export function valueViewPage(): ValueViewPage {
  return {
    mountValueView(value: SerializedValue): void {
      render(<ValueView value={value} />);
    },
    unmountAll(): void {
      cleanup();
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    titledMarkerText(title: string): string {
      return screen.getByTitle(title).textContent?.trim() ?? "";
    },
  };
}
