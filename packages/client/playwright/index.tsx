// Component-test runtime entry. Providers are applied per-scenario inside
// VisualScenario, so this file only normalizes the page chrome.
const style = document.createElement("style");
style.textContent = "html,body{margin:0;padding:0;}";
document.head.appendChild(style);
