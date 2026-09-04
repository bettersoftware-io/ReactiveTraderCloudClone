// packages/client-react-native/tests/pages/MotionProbePage.tsx
import { cleanup, render, screen } from "@testing-library/react-native";

import { MotionProbe } from "#/ui/_probe/MotionProbe";

export interface MotionProbePage {
  mount(): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
}

/** The framework surface for `MotionProbe.test.tsx`. */
export function motionProbePage(): MotionProbePage {
  return {
    async mount(): Promise<void> {
      await render(<MotionProbe />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
  };
}
