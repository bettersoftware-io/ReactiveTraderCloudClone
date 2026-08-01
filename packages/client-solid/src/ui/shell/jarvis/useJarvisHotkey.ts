import { onCleanup, onMount } from "solid-js";

/**
 * Global ⌘/Ctrl+J hotkey — toggles the J.A.R.V.I.S overlay from anywhere in
 * the app. Mirrors ThemePicker's scoped `document` keydown-listener idiom,
 * but mounted unconditionally (not gated on an `open` flag) since the
 * shortcut must work whether the overlay is open or closed.
 *
 * `available` gates the hotkey itself (Task 9 of Phase 3): while the Jarvis
 * backend reports unavailable, ⌘/Ctrl+J is a silent no-op — `toggle()` is
 * never called, so the overlay cannot be opened with the server's brain gone
 * (mirrors JarvisOrb hiding itself on the same flag). Taken as an accessor
 * (not a plain boolean) so the single `onMount`-registered listener always
 * reads the CURRENT value — Solid has no dependency-array re-run to refresh
 * a captured primitive the way the React sibling's `useEffect` does.
 */
export function useJarvisHotkey(
  toggle: () => void,
  available: () => boolean,
): void {
  onMount(() => {
    function toggleJarvisOnHotkey(event: KeyboardEvent): void {
      if (
        (event.metaKey || event.ctrlKey) &&
        (event.key === "j" || event.key === "J")
      ) {
        event.preventDefault();

        if (!available()) {
          return;
        }

        toggle();
      }
    }

    document.addEventListener("keydown", toggleJarvisOnHotkey);

    onCleanup(() => {
      document.removeEventListener("keydown", toggleJarvisOnHotkey);
    });
  });
}
