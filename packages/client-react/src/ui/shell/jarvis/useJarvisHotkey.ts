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
 * (mirrors JarvisOrb hiding itself on the same flag). `available` is in the
 * effect's dependency array, so an availability flip DOES unregister and
 * re-register the listener — the alternative (a ref read, as the Solid
 * sibling's accessor achieves for free) buys nothing here: flips are rare
 * (one per connection, deduped by `distinctUntilChanged`), and a stale
 * captured boolean would be the more expensive bug.
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
