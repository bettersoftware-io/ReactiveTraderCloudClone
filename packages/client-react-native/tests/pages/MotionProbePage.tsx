// packages/client-react-native/tests/pages/MotionProbePage.tsx
import { render, screen } from "@testing-library/react-native";

import { MotionProbe } from "#/ui/_probe/MotionProbe";

export interface MotionProbePage {
  mount(): Promise<void>;
  exists(testId: string): boolean;
}

/** The framework surface for `MotionProbe.test.tsx`. Single test, no
 * `unmountAll` — matches the base spec (no explicit `cleanup()` call; RNTL's
 * auto-cleanup, registered by the bare `@testing-library/react-native`
 * import in `jest.setup.ts`, covers it). */
export function motionProbePage(): MotionProbePage {
  return {
    async mount(): Promise<void> {
      await render(<MotionProbe />);
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
  };
}
