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
    return new Promise<void>((resolve) => {
      cy.get(TILE_PREFIX_SELECTOR, { timeout: timeoutMs })
        .first()
        .should("be.visible")
        .then(() => resolve());
    });
  }

  count(): Promise<number> {
    return new Promise<number>((resolve) => {
      cy.get(TILE_PREFIX_SELECTOR).then(($tiles) => resolve($tiles.length));
    });
  }

  firstTileText(): Promise<string> {
    return new Promise<string>((resolve) => {
      this.firstTile().then(($el) => resolve($el.text()));
    });
  }

  clickFilter(category: string): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.liveRates.filter(category)}"]`)
        .click()
        .then(() => resolve());
    });
  }

  clickViewToggle(): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.liveRates.viewToggle}"]`)
        .click()
        .then(() => resolve());
    });
  }

  viewToggleLabel(): Promise<string> {
    return new Promise<string>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.liveRates.viewToggle}"]`)
        .then(($el) => resolve($el.text()));
    });
  }

  firstTileBuyVisible(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.firstTile().then(($tile) =>
        resolve($tile.find(`[data-testid="${TESTIDS.liveRates.buyBtn}"]`).is(":visible")),
      );
    });
  }

  firstTileSellVisible(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.firstTile().then(($tile) =>
        resolve($tile.find(`[data-testid="${TESTIDS.liveRates.sellBtn}"]`).is(":visible")),
      );
    });
  }

  viewToggleVisible(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.liveRates.viewToggle}"]`)
        .then(($el) => resolve($el.is(":visible")));
    });
  }

  clickBuyOnFirst(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.firstTile()
        .find(`[data-testid="${TESTIDS.liveRates.buyBtn}"]`)
        .click()
        .then(() => resolve());
    });
  }

  clickSellOnFirst(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.firstTile()
        .find(`[data-testid="${TESTIDS.liveRates.sellBtn}"]`)
        .click()
        .then(() => resolve());
    });
  }

  waitForConfirmation(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.get(TILE_CONFIRMATION_SELECTOR, { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }

  confirmationContainsAny(patterns: readonly RegExp[], timeoutMs: number): Promise<void> {
    const combined = new RegExp(patterns.map((p) => p.source).join("|"), "i");
    return new Promise<void>((resolve) => {
      cy.get(TILE_CONFIRMATION_SELECTOR, { timeout: timeoutMs })
        .contains(combined)
        .then(() => resolve());
    });
  }

  dismissConfirmation(): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.get(TILE_CONFIRMATION_SELECTOR)
        .first()
        .click()
        .then(() => resolve());
    });
  }

  confirmationHidden(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.get(TILE_CONFIRMATION_SELECTOR, { timeout: timeoutMs })
        .should("not.exist")
        .then(() => resolve());
    });
  }

  isConfirmationVisible(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      cy.get("body").then(($body) => {
        const found = $body.find(TILE_CONFIRMATION_SELECTOR);
        resolve(found.length > 0 && found.is(":visible"));
      });
    });
  }

  fillFirstTileNotional(value: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.firstTile()
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
        .type("{enter}")
        .then(() => resolve());
    });
  }

  isNotionalInputVisible(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.firstTile().then(($tile) => resolve($tile.find("input").is(":visible")));
    });
  }

  buyNTimesWithDismissals(n: number): Promise<void> {
    // Implement the loop with recursive Cypress chaining to avoid mixing
    // async/await with cy commands, which Cypress does not permit inside a
    // Promise returned to Cucumber's step runner.
    const loop = (remaining: number): void => {
      if (remaining <= 0) return;
      this.firstTile()
        .find(`[data-testid="${TESTIDS.liveRates.buyBtn}"]`)
        .click();
      cy.wait(1_500);
      cy.get("body").then(($body) => {
        const found = $body.find(TILE_CONFIRMATION_SELECTOR);
        if (found.length > 0 && found.css("display") !== "none") {
          cy.get(TILE_CONFIRMATION_SELECTOR).first().click();
          cy.wait(500);
        }
      });
      cy.wrap(null).then(() => loop(remaining - 1));
    };
    return new Promise<void>((resolve) => {
      loop(n);
      cy.wrap(undefined).then(() => resolve());
    });
  }
}
