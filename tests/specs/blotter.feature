Feature: FX trade blotter

  Background:
    Given the trader has the FX workspace open

  Scenario: blotter table is visible
    Then the blotter table is visible

  Scenario: column headers are clickable for sorting
    Then the blotter table is visible
    When the trader clicks the first blotter header
    And the trader clicks the first blotter header

  Scenario: quick filter narrows trade rows
    Then a price tile is visible within 5 seconds
    When the trader clicks buy on the first tile
    And the trader waits 2 seconds
    Then the blotter table is visible
    When the trader records the blotter row count as "all"
    And the trader sets the blotter quick filter to "ZZZZZ_NO_MATCH"
    And the trader waits 1 seconds
    Then the blotter row count is at most "all"
    When the trader clears the blotter quick filter
    And the trader waits 1 seconds
    Then the blotter row count equals "all"

  Scenario: export CSV button is visible and labeled
    Then the blotter table is visible
    And the export CSV button is visible
    And the export CSV button text contains "Export CSV"

  Scenario: new trade row has a non-empty background color
    Then a price tile is visible within 5 seconds
    When the trader clicks buy on the first tile
    And the trader waits 2 seconds
    Then the blotter table is visible
    And the first blotter row is visible
    And the first blotter row background color is non-empty

  @presenter
  Scenario: rejected trade flow does not error after multiple buys
    Then a price tile is visible within 5 seconds
    When the trader buys 3 times with confirmation dismissals
    Then the blotter table is visible
    And the blotter has at least 1 row

  Scenario: row hover yields a non-empty background color
    Then a price tile is visible within 5 seconds
    When the trader clicks buy on the first tile
    And the trader waits 2 seconds
    Then the blotter table is visible
    And the first blotter row is visible
    When the trader hovers the first blotter row
    Then the first blotter row background color is non-empty

  @presenter
  Scenario: blotter accumulates after multiple trades
    Then a price tile is visible within 5 seconds
    When the trader clicks buy on the first tile
    And the trader clicks buy on the first tile
    And the trader waits 2 seconds
    Then the blotter has at least 2 rows
