// packages/client-react-native/src/ui/shell/lock/LockHoldProgressContext.ts
import { createContext } from "react";
import type { SharedValue } from "react-native-reanimated";

/** A pinned hold-ring fill the visual harness injects so `useHoldToUnlock`
 * (and through it the REAL `LockScreen`) renders one fixed partial fill
 * instead of the 0 a never-touched ring rests at. The same seam shape as
 * `BootClockContext`: `null` in production ⇒ the hook owns its own
 * `SharedValue`, driven by the gesture as it always has been. Pinning here
 * rather than mounting the ring alone is what lets `lock/hold` hold the real
 * lock overlay — emblem, identity, password field, ring — as one golden. */
export const LockHoldProgressContext =
  createContext<SharedValue<number> | null>(null);
