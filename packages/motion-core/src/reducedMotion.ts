/** The `prefers-reduced-motion` media query string. The query is view-agnostic
 *  and shared; the `window.matchMedia` call that reads it stays in each
 *  framework's shell (it touches the DOM). */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
