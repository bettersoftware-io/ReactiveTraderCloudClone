Feature: Credit RFQ

  Background:
    Given the credit workspace is open

  Scenario: credit workspace shows navigation tabs
    Then the credit navigation is visible
    And the credit "tiles" tab is visible
    And the credit "new-rfq" tab is visible
    And the credit "sell-side" tab is visible

  Scenario: RFQ tiles panel shows initial state
    Then the credit "tiles" tab is visible
    And the message "No RFQs to display" appears within 5 seconds

  Scenario: navigate to New RFQ form
    When the trader switches to the credit "new-rfq" tab
    Then the credit RFQ submit button appears within 3 seconds

  Scenario: New RFQ form has all required fields
    When the trader switches to the credit "new-rfq" tab
    Then the credit RFQ submit button appears within 3 seconds
    And the credit RFQ form has Buy and Sell direction buttons
    And the credit RFQ form has a Direction label

  Scenario: navigate to Sell Side panel
    When the trader switches to the credit "sell-side" tab
    Then the sell-side heading "Sell Side (Adaptive Bank)" appears within 5 seconds

  Scenario: credit blotter is visible below the workspace
    Then the credit trades heading "Credit Trades" appears within 5 seconds

  Scenario: switching between credit views maintains state
    When the trader switches to the credit "new-rfq" tab
    Then the credit RFQ submit button appears within 3 seconds
    When the trader switches to the credit "tiles" tab
    Then the message "No RFQs to display" appears within 3 seconds
    When the trader switches to the credit "sell-side" tab
    Then the sell-side heading "Sell Side (Adaptive Bank)" appears within 3 seconds
