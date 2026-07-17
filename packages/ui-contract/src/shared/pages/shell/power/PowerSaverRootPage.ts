import { MountedComponent } from "@ui-contract/harness/component";

/**
 * Page object for PowerSaverRoot. Like ThemeProvider, the component renders
 * null and its whole effect is writing flags onto `document.documentElement`
 * (the `data-power-saver` dataset flag + the `--fx-play` custom property every
 * decorative animation reads). There is no rendered root to query through
 * `within(this.root)` — the page reads the document element directly.
 */
export class PowerSaverRootPage extends MountedComponent<
  Record<string, never>
> {
  /** The `data-power-saver` flag stamped on the document root ("true" | "false"). */
  powerSaverFlag(): string {
    return document.documentElement.dataset.powerSaver ?? "";
  }

  /** The `--fx-play` custom property stamped on the document root ("running" | "paused"). */
  fxPlay(): string {
    return document.documentElement.style.getPropertyValue("--fx-play");
  }
}
