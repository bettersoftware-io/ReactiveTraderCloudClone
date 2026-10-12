import { type ReactElement, useState } from "react";

/** A tree-mount test fixture: renders a button and, once clicked, fails every
 * later render — a mounted tree failing after the mount. */
export function BoomOnClick(): ReactElement {
  const [broken, setBroken] = useState(false);

  if (broken) {
    throw new Error("boom later");
  }

  function breakOnNextRender(): void {
    setBroken(true);
  }

  return (
    <button type="button" onClick={breakOnNextRender}>
      break
    </button>
  );
}
