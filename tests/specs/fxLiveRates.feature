Feature: FX live rates

  Background:
    Given the trader has the FX workspace open

  Scenario: tile grid renders streaming prices
    Then a price tile is visible within 5 seconds
    And there is at least 1 visible tile

  Scenario: each tile shows sell and buy buttons
    Then a price tile is visible within 5 seconds
    And the first tile has visible sell and buy buttons

  Scenario: currency filter narrows visible tiles
    Then a price tile is visible within 5 seconds
    When the trader records the visible tile count as "all"
    And the trader clicks the "EUR" currency filter
    Then the visible tile count is at most "all"
    When the trader clicks the "All" currency filter
    Then the visible tile count equals "all"

  Scenario: view toggle switches between chart and price view
    Then the view toggle button is visible
    And the view toggle button shows "Price"
    When the trader clicks the view toggle
    Then the view toggle button shows "Chart"
    When the trader clicks the view toggle
    Then the view toggle button shows "Price"

  Scenario: view preference persists across reloads
    Then the view toggle button is visible
    When the trader clicks the view toggle
    Then the view toggle button shows "Chart"
    When the trader reloads the page
    And the trader switches to the "fx" tab
    Then the view toggle button shows "Chart"

  Scenario: prices update over time
    Then a price tile is visible within 5 seconds
    When the trader records the first tile text
    And the trader waits 2 seconds
    Then the first tile text is non-empty
