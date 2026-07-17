/** Runs in the hidden devtools page. Registers the "RTC" panel; Chrome loads
 * panel.html into it when the developer opens the tab. */
chrome.devtools.panels.create("RTC", "", "panel.html", (): void => {
  // No-op: the panel's own script owns its lifecycle.
});
