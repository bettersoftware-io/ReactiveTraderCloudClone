Feature: FX RFQ flow

  Background:
    Given the trader has the FX workspace open

  Scenario: entering large notional triggers RFQ mode on the tile
    Then a price tile is visible within 5 seconds
    When the trader sets the first tile notional to "10000000"
    Then the RFQ initiation button appears within 3 seconds

  Scenario: RFQ can be initiated and shows countdown
    Then a price tile is visible within 5 seconds
    When the trader sets the first tile notional to "10000000"
    And the RFQ initiation button appears within 3 seconds
    And the trader clicks the RFQ initiation button
    Then a countdown or quote indicator appears within 5 seconds

  @presenter
  Scenario: large notional triggers an RFQ flow on the first tile
    Then a price tile is visible within 5 seconds
    When the trader sets the first tile notional to "10000000"
    And the trader requests an RFQ quote on the first tile
    Then an RFQ quote arrives within 5 seconds
