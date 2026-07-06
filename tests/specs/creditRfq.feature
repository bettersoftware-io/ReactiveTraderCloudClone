Feature: Credit RFQ

  Background:
    Given the credit workspace is open

  Scenario: credit dock shows the New RFQ, RFQs, and Credit Blotter panels together
    Then the credit dock is visible

  Scenario: RFQs panel shows initial state
    Then the credit RFQ list is empty within 5 seconds

  Scenario: New RFQ form has all required fields
    Then the credit RFQ send button appears within 3 seconds
    And the credit RFQ form has Buy and Sell direction buttons
    And the credit RFQ form has a quantity input

  Scenario: creating a new RFQ shows it live in the RFQs panel with a pending quote
    When the trader creates a new credit RFQ quoted to Adaptive Bank
    Then the new RFQ card appears within 5 seconds
    And its first quote is pending

  Scenario: filter pills switch between live and closed RFQs
    When the trader clicks the credit closed filter
    Then the seeded closed RFQs are visible

  Scenario: credit blotter shows existing trades
    Then the credit trades heading "Credit Trades" appears within 5 seconds
    And the credit blotter has at least 2 rows

  @presenter
  Scenario: credit RFQ list is empty when no RFQs have been created
    Then the credit RFQ list is empty within 3 seconds
