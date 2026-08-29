import { useState } from "react";

import type { Scope } from "#/nav/scope";
import { ALL_SCOPE, scopesEqual } from "#/nav/scope";

export interface NavigationModel {
  scope: Scope;
  previousScope: Scope | null;
  select: (scope: Scope) => void;
  pushScope: (scope: Scope) => void;
  popScope: () => boolean;
}

interface NavigationState {
  scope: Scope;
  previousScope: Scope | null;
}

/** The inspector's single selection (spec §3.2) plus a ONE-deep history used
 * only by the wire probe (§4.2): `pushScope` remembers where you were,
 * `popScope` (Esc) takes you back. Plain `select` — clicking the tree —
 * always forgets the history; the probe is the only round trip. */
export function useNavigation(): NavigationModel {
  const [state, setState] = useState<NavigationState>({
    scope: ALL_SCOPE,
    previousScope: null,
  });

  function select(scope: Scope): void {
    setState({ scope, previousScope: null });
  }

  function pushScope(scope: Scope): void {
    setState((prev) => {
      if (scopesEqual(prev.scope, scope)) {
        return prev;
      }

      return { scope, previousScope: prev.scope };
    });
  }

  function popScope(): boolean {
    if (state.previousScope === null) {
      return false;
    }

    setState({ scope: state.previousScope, previousScope: null });

    return true;
  }

  return {
    scope: state.scope,
    previousScope: state.previousScope,
    select,
    pushScope,
    popScope,
  };
}
