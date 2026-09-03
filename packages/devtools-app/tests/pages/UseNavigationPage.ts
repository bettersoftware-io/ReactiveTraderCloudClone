import { act, renderHook } from "@testing-library/react";

import type { Scope } from "#/nav/scope";
import { useNavigation } from "#/nav/useNavigation";

export interface UseNavigationPage {
  readonly scope: Scope;
  readonly previousScope: Scope | null;
  select(scope: Scope): void;
  pushScope(scope: Scope): void;
  popScope(): boolean;
}

/** The framework surface for `useNavigation.test.tsx`. */
export function useNavigationPage(): UseNavigationPage {
  const { result } = renderHook(useNavigation);

  return {
    get scope(): Scope {
      return result.current.scope;
    },
    get previousScope(): Scope | null {
      return result.current.previousScope;
    },
    select(scope: Scope): void {
      act(() => {
        result.current.select(scope);
      });
    },
    pushScope(scope: Scope): void {
      act(() => {
        result.current.pushScope(scope);
      });
    },
    popScope(): boolean {
      let popped = false;

      act(() => {
        popped = result.current.popScope();
      });

      return popped;
    },
  };
}
