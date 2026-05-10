import type { LiveRatesTilePO } from "../contracts/LiveRatesTile";
import { TESTIDS } from "../contracts/testids";

const TILE_PREFIX_SELECTOR = `[data-testid^="${TESTIDS.liveRates.tilePrefix}"]`;
const CONFIRMATION_SELECTOR = `[data-testid="${TESTIDS.liveRates.tradeConfirmation}"]`;
const TILE_CONFIRMATION_SELECTOR = `${TILE_PREFIX_SELECTOR} ${CONFIRMATION_SELECTOR}`;

export class CypressLiveRatesTile implements LiveRatesTilePO {
  private firstTile() {
    return cy.get(TILE_PREFIX_SELECTOR).first();
  }

  waitForFirstTile(timeoutMs: number): Promise<void> {
    return cy.get(TILE_PREFIX_SELECTOR, { timeout: timeoutMs })
      .first()
      .should("be.visible") as unknown as Promise<void>;
  }

  count(): Promise<number> {
    return cy.get(TILE_PREFIX_SELECTOR)
      .then(($tiles) => $tiles.length) as unknown as Promise<number>;
  }

  firstTileText(): Promise<string> {
    return this.firstTile()
      .then(($el) => $el.text()) as unknown as Promise<string>;
  }

  clickFilter(category: string): Promise<void> {
    return cy.get(`[data-testid="${TESTIDS.liveRates.filter(category)}"]`)
      .click() as unknown as Promise<void>;
  }

  clickViewToggle(): Promise<void> {
    return cy.get(`[data-testid="${TESTIDS.liveRates.viewToggle}"]`)
      .click() as unknown as Promise<void>;
  }

  viewToggleLabel(): Promise<string> {
    return cy.get(`[data-testid="${TESTIDS.liveRates.viewToggle}"]`)
      .then(($el) => $el.text()) as unknown as Promise<string>;
  }

  firstTileBuyVisible(): Promise<boolean> {
    return this.firstTile()
      .then(($tile) =>
        $tile.find(`[data-testid="${TESTIDS.liveRates.buyBtn}"]`).is(":visible"),
      ) as unknown as Promise<boolean>;
  }

  firstTileSellVisible(): Promise<boolean> {
    return this.firstTile()
      .then(($tile) =>
        $tile.find(`[data-testid="${TESTIDS.liveRates.sellBtn}"]`).is(":visible"),
      ) as unknown as Promise<boolean>;
  }

  viewToggleVisible(): Promise<boolean> {
    return cy.get(`[data-testid="${TESTIDS.liveRates.viewToggle}"]`)
      .then(($el) => $el.is(":visible")) as unknown as Promise<boolean>;
  }

  clickBuyOnFirst(): Promise<void> {
    return this.firstTile()
      .find(`[data-testid="${TESTIDS.liveRates.buyBtn}"]`)
      .click() as unknown as Promise<void>;
  }

  clickSellOnFirst(): Promise<void> {
    return this.firstTile()
      .find(`[data-testid="${TESTIDS.liveRates.sellBtn}"]`)
      .click() as unknown as Promise<void>;
  }

  waitForConfirmation(timeoutMs: number): Promise<void> {
    return cy.get(TILE_CONFIRMATION_SELECTOR, { timeout: timeoutMs })
      .should("be.visible") as unknown as Promise<void>;
  }

  confirmationContainsAny(patterns: readonly RegExp[], timeoutMs: number): Promise<void> {
    const combined = new RegExp(patterns.map((p) => p.source).join("|"), "i");
    return cy.get(TILE_CONFIRMATION_SELECTOR, { timeout: timeoutMs })
      .contains(combined) as unknown as Promise<void>;
  }

  dismissConfirmation(): Promise<void> {
    return cy.get(TILE_CONFIRMATION_SELECTOR)
      .first()
      .click() as unknown as Promise<void>;
  }

  confirmationHidden(timeoutMs: number): Promise<void> {
    return cy.get(TILE_CONFIRMATION_SELECTOR, { timeout: timeoutMs })
      .should("not.exist") as unknown as Promise<void>;
  }

  isConfirmationVisible(): Promise<boolean> {
    return cy.get("body").then(($body) => {
      const found = $body.find(TILE_CONFIRMATION_SELECTOR);
      return found.length > 0 && found.is(":visible");
    }) as unknown as Promise<boolean>;
  }

  fillFirstTileNotional(value: string): Promise<void> {
    return this.firstTile()
      .scrollIntoView()
      .find("input")
      .then(($input) => {
        // React controlled inputs require using the native setter so that React's
        // internal value tracker sees the change and fires synthetic onChange.
        const nativeSet = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )!.set;
        nativeSet!.call($input[0], value);
        $input[0].dispatchEvent(new Event("input", { bubbles: true }));
      })
      .type("{enter}") as unknown as Promise<void>;
  }

  isNotionalInputVisible(): Promise<boolean> {
    return this.firstTile()
      .then(($tile) => $tile.find("input").is(":visible")) as unknown as Promise<boolean>;
  }
}
