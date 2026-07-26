import { useEffect } from "react";

/**
 * Global ⌘/Ctrl+J hotkey — toggles the J.A.R.V.I.S overlay from anywhere in
 * the app. Mirrors ThemePicker's scoped `document` keydown-listener idiom,
 * but mounted unconditionally (not gated on an `open` flag) since the
 * shortcut must work whether the overlay is open or closed.
 */
export function useJarvisHotkey(toggle: () => void): void {
  useEffect(() => {
    function toggleJarvisOnHotkey(event: KeyboardEvent): void {
      if (
        (event.metaKey || event.ctrlKey) &&
        (event.key === "j" || event.key === "J")
      ) {
        event.preventDefault();
        toggle();
      }
    }

    document.addEventListener("keydown", toggleJarvisOnHotkey);

    return () => {
      document.removeEventListener("keydown", toggleJarvisOnHotkey);
    };
  }, [toggle]);
}
