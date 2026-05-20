Feature: FX trading

  Background:
    Given the trader has the FX workspace open

  @presenter
  Scenario: execute a buy trade and see confirmation
    Then a price tile is visible within 5 seconds
    When the trader clicks buy on the first tile
    Then the trade confirmation appears within 5 seconds
    And the trade confirmation matches one of /Executing/i, /You Bought/i, /rejected/i

  @presenter
  Scenario: execute a sell trade and see confirmation
    Then a price tile is visible within 5 seconds
    When the trader clicks sell on the first tile
    Then the trade confirmation appears within 5 seconds
    And the trade confirmation matches one of /Executing/i, /You Sold/i, /rejected/i

  Scenario: trade confirmation is dismissible by clicking
    Then a price tile is visible within 5 seconds
    When the trader clicks buy on the first tile
    Then the trade confirmation appears within 5 seconds
    And the trade confirmation matches one of /You Bought/i, /You Sold/i, /rejected/i, /timed out/i, /Credit limit/i within 10 seconds
    When the trader dismisses the trade confirmation
    Then the trade confirmation hides within 5 seconds

  @presenter
  Scenario: executed trade appears in the blotter
    Then a price tile is visible within 5 seconds
    When the trader clicks buy on the first tile
    And the trader waits 2 seconds
    Then the blotter table is visible
    And the blotter has at least 1 row

  Scenario: notional input accepts custom values
    Then a price tile is visible within 5 seconds
    Then the notional input on the first tile is visible
    When the trader sets the first tile notional to "5000000"

  @presenter
  Scenario: executed trade carries the requested notional
    Then a price tile is visible within 5 seconds
    When the trader executes a buy for "1000000" on the first tile
    Then the executed trade carries notional "1000000"

  @presenter
  Scenario: rejected trades occur with non-zero probability across multiple attempts
    Then a price tile is visible within 5 seconds
    When the trader buys 5 times with confirmation dismissals
    Then at least one trade was rejected
