Feature: Analytics panel

  Background:
    Given the trader has the FX workspace open

  Scenario: analytics panel is visible with sections
    Then the analytics panel is visible within 5 seconds
    And the analytics panel shows the section "Analytics"
    And the analytics panel shows the section "Profit & Loss"
    And the analytics panel shows the section "Positions"
    And the analytics panel shows the section "PnL per Currency Pair"

  Scenario: PnL section is visible
    Then the analytics panel is visible within 5 seconds
    And the analytics panel shows the section "Profit & Loss"

  Scenario: positions section is visible
    Then the analytics panel is visible within 5 seconds
    And the analytics panel shows the section "Positions"

  Scenario: analytics panel shows alongside live rates
    Then a price tile is visible
    And the analytics panel is visible within 5 seconds
