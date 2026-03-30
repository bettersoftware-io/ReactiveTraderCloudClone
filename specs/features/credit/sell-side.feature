Feature: Credit Sell-Side (Dealer View)
  As a dealer (Adaptive Bank)
  I want to see incoming RFQs and respond with quotes
  So that I can participate in the credit trading workflow

  Background:
    Given the trader is connected to the credit service
    And "Adaptive Bank" is present in the dealer list
    And a client has created an RFQ with "Adaptive Bank" as a selected dealer

  # -------------------------------------------------------------------
  # Sell-side view availability
  # -------------------------------------------------------------------

  Scenario: Sell-side view shows trade tickets for Adaptive Bank RFQs
    Given an RFQ includes "Adaptive Bank" as a selected dealer
    Then a trade ticket for that RFQ appears in the sell-side view

  Scenario: RFQs without Adaptive Bank do not appear in sell-side
    Given an RFQ does not include "Adaptive Bank" as a selected dealer
    Then no trade ticket appears in the sell-side view for that RFQ

  Scenario: Sell-side view opens in a separate window or panel
    When the trader opens the sell-side view
    Then it is displayed in a separate window or panel from the buy-side view

  # -------------------------------------------------------------------
  # Trade ticket display
  # -------------------------------------------------------------------

  Scenario: Trade ticket shows instrument details
    Then the trade ticket displays the instrument name
    And the trade ticket displays the instrument CUSIP
    And the trade ticket displays the instrument maturity

  Scenario: Trade ticket shows direction from the client perspective
    Given the RFQ direction is "Buy" from the client perspective
    Then the trade ticket displays the direction as "Buy"

  Scenario: Trade ticket shows quantity
    Given the RFQ quantity is 500,000
    Then the trade ticket displays the quantity as "500,000"

  # -------------------------------------------------------------------
  # Submitting a quote
  # -------------------------------------------------------------------

  Scenario: Dealer enters a price and submits the quote
    When the dealer enters a price of "102" in the price input
    And the dealer clicks the submit button
    Then the quote RPC is called with the dealer's quoteId and price 102
    And the trade ticket shows the submitted state

  # -------------------------------------------------------------------
  # Passing on an RFQ
  # -------------------------------------------------------------------

  Scenario: Dealer passes on an RFQ
    When the dealer clicks the pass button
    Then the pass RPC is called for the dealer's quoteId
    And the trade ticket shows the passed state

  # -------------------------------------------------------------------
  # RFQ lifecycle updates
  # -------------------------------------------------------------------

  Scenario: Trade ticket updates when RFQ is cancelled
    Given the dealer has not yet responded to the RFQ
    When the client cancels the RFQ
    Then the trade ticket updates to show the RFQ is cancelled
    And the price input and action buttons are disabled

  Scenario: Trade ticket updates when RFQ expires
    Given the dealer has not yet responded to the RFQ
    When the RFQ expiry countdown reaches zero
    Then the trade ticket updates to show the RFQ is expired
    And the price input and action buttons are disabled

  Scenario: Trade ticket updates after dealer submits a quote
    Given the dealer has submitted a quote with price 102
    Then the trade ticket shows the submitted price "$102"
    And the price input and action buttons are disabled
