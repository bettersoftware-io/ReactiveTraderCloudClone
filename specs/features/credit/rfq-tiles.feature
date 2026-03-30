Feature: Credit RFQ Tiles
  As a buy-side trader
  I want to see all my RFQs as visual cards
  So that I can monitor dealer responses and act on quotes

  Background:
    Given the trader is connected to the credit service
    And RFQs are loaded via the WorkflowService subscription

  # -------------------------------------------------------------------
  # Tile display
  # -------------------------------------------------------------------

  Scenario: RFQ tiles view shows a card for each RFQ
    Given there are multiple RFQs in various states
    Then each RFQ is displayed as a separate card
    And each card shows the instrument name
    And each card shows the direction
    And each card shows the quantity
    And each card shows the dealer quote cards

  # -------------------------------------------------------------------
  # Filter tabs
  # -------------------------------------------------------------------

  Scenario: Live filter shows only Open state RFQs
    Given there are RFQs in Open, Closed, Expired, and Cancelled states
    When the trader selects the "Live" filter tab
    Then only RFQs in the Open state are displayed

  Scenario: All filter shows every RFQ
    Given there are RFQs in various states
    When the trader selects the "All" filter tab
    Then all RFQs are displayed regardless of state

  Scenario: Done filter shows only Closed state RFQs
    Given there are RFQs in Open, Closed, Expired, and Cancelled states
    When the trader selects the "Done" filter tab
    Then only RFQs in the Closed state are displayed

  Scenario: Expired filter shows only Expired state RFQs
    Given there are RFQs in Open, Closed, Expired, and Cancelled states
    When the trader selects the "Expired" filter tab
    Then only RFQs in the Expired state are displayed

  Scenario: Cancelled filter shows only Cancelled state RFQs
    Given there are RFQs in Open, Closed, Expired, and Cancelled states
    When the trader selects the "Cancelled" filter tab
    Then only RFQs in the Cancelled state are displayed

  # -------------------------------------------------------------------
  # Quote card states
  # -------------------------------------------------------------------

  Scenario: Quote card shows "Awaiting response" for pending without price
    Given an RFQ has a dealer in pendingWithoutPrice state
    Then that dealer's quote card displays "Awaiting response"

  Scenario: Quote card shows "Awaiting response" for rejected without price
    Given an RFQ has a dealer in rejectedWithoutPrice state
    Then that dealer's quote card displays "Awaiting response"

  Scenario: Quote card shows dollar-formatted price for pending with price
    Given an RFQ has a dealer in pendingWithPrice state with price 102
    Then that dealer's quote card displays "$102"

  Scenario: Quote card shows dollar-formatted price for accepted quote
    Given an RFQ has a dealer in accepted state with price 102
    Then that dealer's quote card displays "$102"

  Scenario: Quote card shows dollar-formatted price for rejected with price
    Given an RFQ has a dealer in rejectedWithPrice state with price 98
    Then that dealer's quote card displays "$98"

  Scenario: Quote card shows "Passed" for a dealer that passed
    Given an RFQ has a dealer in passed state
    Then that dealer's quote card displays "Passed"
    And the quote card fades to inactive styling after 6 seconds

  # -------------------------------------------------------------------
  # Countdown timer
  # -------------------------------------------------------------------

  Scenario: Open RFQ card shows a countdown timer
    Given an RFQ is in Open state with expirySecs of 120
    Then the RFQ card displays a countdown timer
    And the timer counts down from the remaining seconds

  Scenario: Non-open RFQ card does not show a countdown timer
    Given an RFQ is in Closed state
    Then the RFQ card does not display a countdown timer

  # -------------------------------------------------------------------
  # Dismissing non-open RFQs
  # -------------------------------------------------------------------

  Scenario: Completed RFQ can be dismissed from view
    Given an RFQ is in Closed state
    Then the RFQ card shows a dismiss control
    When the trader dismisses the RFQ card
    Then the card is removed from the tiles view

  Scenario: Expired RFQ can be dismissed from view
    Given an RFQ is in Expired state
    When the trader dismisses the RFQ card
    Then the card is removed from the tiles view

  Scenario: Cancelled RFQ can be dismissed from view
    Given an RFQ is in Cancelled state
    When the trader dismisses the RFQ card
    Then the card is removed from the tiles view

  Scenario: Dismissed RFQ does not reappear
    Given the trader has dismissed an RFQ card
    When the WorkflowService emits updated RFQ data
    Then the dismissed RFQ ID is tracked
    And the dismissed RFQ card does not reappear in the tiles view

  Scenario: Open RFQ cannot be dismissed
    Given an RFQ is in Open state
    Then the RFQ card does not show a dismiss control
