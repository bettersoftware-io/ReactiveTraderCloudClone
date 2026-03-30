Feature: FX Request for Quote (RFQ)
  As a trader dealing in large notional amounts
  I want to request a firm quote from the server
  So that I can trade at a guaranteed price for a high-value order

  Background:
    Given the trader is connected to the pricing service
    And a currency pair tile is loaded with live prices
    And the notional is set to 10,000,000 or above

  # -------------------------------------------------------------------
  # Initiating an RFQ
  # -------------------------------------------------------------------

  Scenario: Initiate RFQ button replaces Buy/Sell when notional >= 10,000,000
    Given the notional is set to 10,000,000
    Then the Buy and Sell price buttons are not visible
    And an "Initiate RFQ" button is displayed on the tile

  Scenario: Clicking Initiate RFQ transitions to the Requested state
    Given the tile shows the "Initiate RFQ" button
    When the trader clicks "Initiate RFQ"
    Then the tile transitions to the Requested state
    And the button label changes to "Cancel RFQ"
    And the price buttons display an "Awaiting Price" loading indicator

  Scenario: Server responds with a firm quote
    Given the trader has clicked "Initiate RFQ"
    And the tile is in the Requested state
    When the server responds with a firm quote
    Then the tile transitions to the Received state
    And the Buy and Sell buttons reappear with the quoted bid and ask prices
    And a countdown timer is displayed on the tile
    And the countdown starts at 10 seconds
    And a progress bar shows the remaining time visually
    And a "Reject" button is displayed next to the timer

  # -------------------------------------------------------------------
  # Accepting a quote
  # -------------------------------------------------------------------

  Scenario: Accepting a quote by clicking Buy
    Given the tile is in the Received state with a firm quote
    And the countdown timer is still active
    When the trader clicks the Buy button
    Then the tile transitions to the execution flow
    And the trade is executed at the quoted ask price
    And a green confirmation overlay is displayed

  Scenario: Accepting a quote by clicking Sell
    Given the tile is in the Received state with a firm quote
    And the countdown timer is still active
    When the trader clicks the Sell button
    Then the tile transitions to the execution flow
    And the trade is executed at the quoted bid price
    And a green confirmation overlay is displayed

  # -------------------------------------------------------------------
  # Quote expiry
  # -------------------------------------------------------------------

  Scenario: Quote expires when the countdown timer reaches zero
    Given the tile is in the Received state with a firm quote
    And the countdown timer shows 10 seconds remaining
    When 10 seconds elapse without the trader accepting or rejecting the quote
    Then the tile transitions to the Rejected state
    And the Buy and Sell buttons show "Expired" labels
    And the prices are displayed as expired

  Scenario: Requote button appears after quote expiry
    Given the quote has expired on the tile
    When 2 seconds elapse after the expiry
    Then the tile returns to the Init state
    And a "Requote" button is displayed on the tile

  Scenario: Clicking Requote initiates a new RFQ
    Given the tile displays a "Requote" button after a previous quote expired
    When the trader clicks "Requote"
    Then the tile transitions to the Requested state
    And the button label changes to "Cancel RFQ"

  # -------------------------------------------------------------------
  # User rejects a quote
  # -------------------------------------------------------------------

  Scenario: Trader rejects the quote before it expires
    Given the tile is in the Received state with a firm quote
    And the countdown timer is still active
    When the trader clicks the "Reject" button
    Then the tile transitions to the Rejected state
    And the Buy and Sell buttons show "Expired" labels

  Scenario: Tile returns to Init state after rejection
    Given the trader has rejected the quote
    And the tile is in the Rejected state
    When 2 seconds elapse
    Then the tile returns to the Init state
    And the "Initiate RFQ" button is displayed

  # -------------------------------------------------------------------
  # User cancels before quote arrives
  # -------------------------------------------------------------------

  Scenario: Trader cancels the RFQ during the Requested state
    Given the trader has clicked "Initiate RFQ"
    And the tile is in the Requested state showing "Cancel RFQ"
    When the trader clicks "Cancel RFQ"
    Then the tile returns to the Init state immediately
    And the "Initiate RFQ" button is displayed

  # -------------------------------------------------------------------
  # NZDUSD automatic RFQ mode
  # -------------------------------------------------------------------

  Scenario: NZDUSD loads directly in RFQ mode
    Given the NZDUSD tile has a default notional of 10,000,000
    When the Live Rates grid loads
    Then the NZDUSD tile is in RFQ mode
    And the NZDUSD tile displays an "Initiate RFQ" button instead of Buy/Sell
    And the NZDUSD notional input displays "10,000,000"

  # -------------------------------------------------------------------
  # Duplicate request prevention
  # -------------------------------------------------------------------

  Scenario: Duplicate RFQ requests are ignored while a request is pending
    Given the trader has clicked "Initiate RFQ"
    And the tile is in the Requested state
    When the trader clicks "Cancel RFQ" and immediately clicks "Initiate RFQ" again
    Then only one RFQ request is sent to the server

  Scenario: RFQ button is disabled when notional exceeds maximum
    Given the notional is set to 1,200,000,000
    And the tile displays the "Max exceeded" error
    Then the "Initiate RFQ" button is disabled

  # -------------------------------------------------------------------
  # Notional input locked during RFQ lifecycle
  # -------------------------------------------------------------------

  Scenario: Notional input is disabled during the Requested state
    Given the trader has clicked "Initiate RFQ"
    And the tile is in the Requested state
    Then the notional input is disabled

  Scenario: Notional input is disabled during the Received state
    Given the tile is in the Received state with a firm quote
    Then the notional input is disabled

  Scenario: Notional input is enabled after returning to Init state
    Given the tile has returned to the Init state after a quote expired
    Then the notional input is enabled
