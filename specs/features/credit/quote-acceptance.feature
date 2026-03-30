Feature: Accept Credit Quote
  As a buy-side trader
  I want to accept a dealer's quoted price on my RFQ
  So that I can execute a credit trade at that price

  Background:
    Given the trader is connected to the credit service
    And an RFQ is in Open state with at least one dealer in pendingWithPrice state

  # -------------------------------------------------------------------
  # Accepting a quote
  # -------------------------------------------------------------------

  Scenario: Accept a priced quote
    Given a dealer has submitted a quote with price 102
    When the trader clicks the accept button on that dealer's quote card
    Then the accept RPC is called with the dealer's quoteId

  Scenario: Only priced quotes can be accepted
    Given a dealer is in pendingWithoutPrice state
    Then the accept button is not available on that dealer's quote card

  # -------------------------------------------------------------------
  # Post-acceptance state transitions
  # -------------------------------------------------------------------

  Scenario: Accepted quote transitions to accepted state
    Given the trader has accepted a quote from "J.P. Morgan" with price 102
    When the accept RPC returns an ack response
    Then "J.P. Morgan"'s quote card transitions to "accepted" state
    And the quote card displays "$102"

  Scenario: Other pending quotes are auto-rejected after acceptance
    Given the RFQ has the following dealer states:
      | Dealer          | State               |
      | J.P. Morgan     | pendingWithPrice     |
      | Wells Fargo     | pendingWithPrice     |
      | Goldman Sachs   | pendingWithoutPrice  |
      | Citigroup       | passed               |
    When the trader accepts "J.P. Morgan"'s quote
    And the accept RPC returns an ack response
    Then "Wells Fargo"'s quote transitions to rejectedWithPrice
    And "Goldman Sachs"'s quote transitions to rejectedWithoutPrice
    And "Citigroup"'s quote remains in passed state

  Scenario: RFQ transitions to Closed state after acceptance
    Given the trader has accepted a quote
    When the accept RPC returns an ack response
    Then the RFQ transitions to Closed state
    And the RFQ card moves from the "Live" filter to the "Done" filter

  # -------------------------------------------------------------------
  # Credit blotter integration
  # -------------------------------------------------------------------

  Scenario: Accepted trade appears in the credit blotter
    Given the trader has accepted a quote from "J.P. Morgan" on "ORCL 4.755 08/15/2026"
    And the quote price was 102
    And the RFQ direction was "Buy"
    And the RFQ quantity was 500,000
    When the accept RPC returns an ack response
    Then a new row appears in the credit blotter with:
      | Column       | Value                    |
      | Trade ID     | <the RFQ ID>             |
      | Status       | Accepted                 |
      | Trade Date   | <today in dd-MMM-yyyy>   |
      | Direction    | Buy                      |
      | Counterparty | J.P. Morgan              |
      | CUSIP        | 68389X105                |
      | Security     | ORCL                     |
      | Quantity     | 500,000                  |
      | Order Type   | AON                      |
      | Unit Price   | $102                     |
