// packages/client-react-native/tests/pages/HarnessProbePage.tsx
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

export interface HarnessProbePage {
  mount(text: string): Promise<void>;
  hasText(text: string): boolean;
}

/** The framework surface for `harnessProbe.test.tsx` — the RNTL smoke test
 * proving the jest RN harness itself renders and queries a component. Takes
 * the label text as a parameter rather than hardcoding it, since asserting
 * that exact string is the whole point of the smoke test and it must stay
 * spec-side. Single test, no `unmountAll` — matches the base spec, which
 * never called `cleanup()` either (RNTL's auto-cleanup, registered by the
 * bare `@testing-library/react-native` import in `jest.setup.ts`, covers
 * it). */
export function harnessProbePage(): HarnessProbePage {
  return {
    async mount(text: string): Promise<void> {
      await render(<Text>{text}</Text>);
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
  };
}
