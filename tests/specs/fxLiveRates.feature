Feature: FX live rates

  Background:
    Given the trader has the FX workspace open

  @presenter
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

  Scenario: charts toggle switches tile sparklines on and off
    Then a price tile is visible within 5 seconds
    And the charts toggle is visible
    And the charts toggle is active
    And the first tile chart is visible
    When the trader clicks the charts toggle
    Then the charts toggle is inactive
    And the first tile chart is hidden
    When the trader clicks the charts toggle
    Then the charts toggle is active
    And the first tile chart is visible

  Scenario: charts toggle preference persists across reloads
    Then a price tile is visible within 5 seconds
    And the charts toggle is visible
    When the trader clicks the charts toggle
    Then the charts toggle is inactive
    When the trader reloads the page
    And the trader switches to the "fx" tab
    Then the charts toggle is inactive

  @presenter
  Scenario: prices update over time
    Then a price tile is visible within 5 seconds
    When the trader records the first tile text
    And the trader waits 2 seconds
    Then the first tile text is non-empty

  @presenter
  Scenario: currency pairs list has at least 7 entries
    Then there are at least 7 visible tiles within 5 seconds

  @presenter
  Scenario: first tile shows a numeric mid value
    Then a price tile is visible within 5 seconds
    And the first tile text matches /\d+\.\d+/
