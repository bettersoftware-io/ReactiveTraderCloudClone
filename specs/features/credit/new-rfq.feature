Feature: Create New Credit RFQ
  As a buy-side trader
  I want to create a Request for Quote on a bond
  So that I can solicit prices from multiple dealers

  Background:
    Given the trader is connected to the credit service
    And the instrument reference data is loaded
    And the dealer reference data is loaded

  # -------------------------------------------------------------------
  # RFQ form display
  # -------------------------------------------------------------------

  Scenario: New RFQ form displays required fields
    When the trader opens the New RFQ form
    Then the form displays an instrument search field
    And the form displays a direction toggle with "Buy" and "Sell" options
    And the form displays a quantity input field
    And the form displays a dealer selection list

  # -------------------------------------------------------------------
  # Instrument search
  # -------------------------------------------------------------------

  Scenario: Instrument search matches by ticker
    When the trader types "ORCL" in the instrument search field
    Then the search results include "ORCL 4.755 08/15/2026"

  Scenario: Instrument search matches by name
    When the trader types "ORCL 4.755" in the instrument search field
    Then the search results include "ORCL 4.755 08/15/2026"

  Scenario: Instrument search matches by CUSIP
    When the trader types "68389X105" in the instrument search field
    Then the search results include "ORCL 4.755 08/15/2026"

  Scenario: Selecting an instrument displays its details
    Given the trader has searched for "ORCL"
    When the trader selects "ORCL 4.755 08/15/2026" from the results
    Then the form displays the instrument name "ORCL 4.755 08/15/2026"
    And the form displays the CUSIP "68389X105"
    And the form displays the maturity date
    And the form displays the coupon rate "4.755"

  # -------------------------------------------------------------------
  # Direction
  # -------------------------------------------------------------------

  Scenario: Direction toggle defaults to Buy
    When the trader opens the New RFQ form
    Then the direction toggle is set to "Buy"

  Scenario: Trader can switch direction to Sell
    When the trader clicks the "Sell" direction toggle
    Then the direction toggle is set to "Sell"

  # -------------------------------------------------------------------
  # Quantity input
  # -------------------------------------------------------------------

  Scenario: Quantity input multiplies entered value by 1000
    When the trader enters "500" in the quantity field
    Then the submitted quantity will be 500,000

  Scenario: Maximum quantity input is 100,000,000
    When the trader enters a value exceeding 100,000,000 in the quantity field
    Then the quantity is capped at 100,000,000

  # -------------------------------------------------------------------
  # Dealer selection
  # -------------------------------------------------------------------

  Scenario: All dealers are selected by default
    When the trader opens the New RFQ form
    Then all available dealers are checked in the dealer selection list

  Scenario: Trader can deselect individual dealers
    Given all dealers are selected
    When the trader unchecks "Goldman Sachs" from the dealer list
    Then "Goldman Sachs" is not included in the selected dealers
    And all other dealers remain selected

  # -------------------------------------------------------------------
  # RFQ submission
  # -------------------------------------------------------------------

  Scenario: Submitting a valid RFQ shows confirmation
    Given the trader has selected instrument "ORCL 4.755 08/15/2026"
    And the direction is set to "Buy"
    And the quantity is set to "1000"
    And at least one dealer is selected
    When the trader clicks the submit button
    Then a confirmation is displayed with the instrument details
    And the confirmation shows the assigned RFQ ID

  Scenario: After submission the trader is navigated to the RFQ tiles view
    Given the trader has submitted a valid RFQ
    Then the view transitions to the RFQ tiles view

  Scenario: The new RFQ appears as a live card
    Given the trader has submitted a valid RFQ
    When the RFQ tiles view loads
    Then a new RFQ card appears for the submitted instrument
    And the card is in the "Live" state
    And the card shows the selected dealers awaiting responses
