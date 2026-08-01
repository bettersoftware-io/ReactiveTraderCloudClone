import { useEffect } from "react";

/**
 * Global ⌘/Ctrl+J hotkey — toggles the J.A.R.V.I.S overlay from anywhere in
 * the app. Mirrors ThemePicker's scoped `document` keydown-listener idiom,
 * but mounted unconditionally (not gated on an `open` flag) since the
 * shortcut must work whether the overlay is open or closed.
 *
 * `available` gates the hotkey itself (Task 9 of Phase 3): while the Jarvis
 * backend reports unavailable, ⌘/Ctrl+J is a silent no-op — `toggle()` is
 * never called, so the overlay cannot be opened with the server's brain gone
 * (mirrors JarvisOrb hiding itself on the same flag). The listener stays
 * registered either way; only the dispatch is gated, so re-registration cost
 * on an availability flip is avoided.
 */
export function useJarvisHotkey(toggle: () => void, available: boolean): void {
  useEffect(() => {
    function toggleJarvisOnHotkey(event: KeyboardEvent): void {
      if (
        (event.metaKey || event.ctrlKey) &&
        (event.key === "j" || event.key === "J")
      ) {
        event.preventDefault();

        if (!available) {
          return;
        }

        toggle();
      }
    }

    document.addEventListener("keydown", toggleJarvisOnHotkey);

    return () => {
      document.removeEventListener("keydown", toggleJarvisOnHotkey);
    };
  }, [toggle, available]);
}
