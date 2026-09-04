// packages/client-react-native/tests/pages/HarnessProbePage.tsx
import { cleanup, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

export interface HarnessProbePage {
  mount(text: string): Promise<void>;
  unmountAll(): Promise<void>;
  hasText(text: string): boolean;
}

/** The framework surface for `harnessProbe.test.tsx` — the RNTL smoke test
 * proving the jest RN harness itself renders and queries a component. Takes
 * the label text as a parameter rather than hardcoding it, since asserting
 * that exact string is the whole point of the smoke test and it must stay
 * spec-side. */
export function harnessProbePage(): HarnessProbePage {
  return {
    async mount(text: string): Promise<void> {
      await render(<Text>{text}</Text>);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
  };
}
