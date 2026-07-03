Feature: Analytics panel

  Background:
    Given the trader has the FX workspace open

  Scenario: analytics panel is visible with sections
    Then the analytics panel is visible within 5 seconds
    And the analytics panel shows the section "Profit & Loss"
    And the analytics panel shows the section "PnL per Currency Pair"

  Scenario: PnL section is visible
    Then the analytics panel is visible within 5 seconds
    And the analytics panel shows the section "Profit & Loss"

  Scenario: positions panel shows net exposure
    Then the positions panel is visible within 5 seconds
    And the positions panel shows at least 1 exposure bubble
    And the first exposure bubble has a signed amount
    And the first exposure ladder row has a signed amount

  @presenter
  Scenario: analytics panel shows alongside live rates
    Then a price tile is visible
    And the analytics panel is visible within 5 seconds

  @presenter
  Scenario: analytics presenter emits a non-empty snapshot
    Then the analytics presenter emits within 5 seconds
