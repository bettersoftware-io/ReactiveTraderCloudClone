import { Appearance } from "react-native";
import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";

import type { ColorSchemeSource } from "@rtc/client-core";

interface ColorSchemePref {
  colorScheme: "dark" | "light" | null;
}

type ColorSchemeListener = (pref: ColorSchemePref) => void;

interface RemoveHandle {
  remove: () => void;
}

/** The minimal slice of RN's `Appearance` this adapter needs — injected so the
 * reactive logic is unit-testable without the native module. */
interface AppearanceLike {
  getColorScheme(): "dark" | "light" | null;
  addChangeListener(listener: ColorSchemeListener): RemoveHandle;
}

function toDarkLightOrNull(
  scheme: string | null | undefined,
): "dark" | "light" | null {
  return scheme === "dark" || scheme === "light" ? scheme : null;
}

/** Narrows RN's real `Appearance` (whose `ColorSchemeName` also includes
 * `"unspecified"`, and whose getters may return `undefined`) down to
 * `AppearanceLike` — everything besides `"dark"`/`"light"` collapses to
 * `null`, i.e. not dark. */
const RN_APPEARANCE: AppearanceLike = {
  getColorScheme: (): "dark" | "light" | null => {
    return toDarkLightOrNull(Appearance.getColorScheme());
  },
  addChangeListener: (listener: ColorSchemeListener): RemoveHandle => {
    return Appearance.addChangeListener((pref) => {
      listener({ colorScheme: toDarkLightOrNull(pref.colorScheme) });
    });
  },
};

/**
 * RN `ColorSchemeSource` backed by `Appearance`. Seeds a BehaviorSubject from
 * the current OS scheme (so subscribers get a value synchronously — no flash)
 * and pushes on every change. The RN analogue of the web
 * `MediaQueryColorSchemeAdapter`; a single instance owned by the composition
 * root for the app's lifetime, so the change listener is not torn down.
 */
export class AppearanceColorSchemeAdapter implements ColorSchemeSource {
  private readonly dark: BehaviorSubject<boolean>;

  constructor(appearance: AppearanceLike = RN_APPEARANCE) {
    this.dark = new BehaviorSubject<boolean>(
      appearance.getColorScheme() === "dark",
    );
    appearance.addChangeListener((pref) => {
      this.dark.next(pref.colorScheme === "dark");
    });
  }

  prefersDark$(): Observable<boolean> {
    return this.dark.pipe(distinctUntilChanged());
  }
}
