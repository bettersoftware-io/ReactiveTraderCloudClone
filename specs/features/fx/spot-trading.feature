Feature: FX Spot Tile Trading
  As a trader
  I want to execute spot FX trades directly from a tile
  So that I can act quickly on market prices

  Background:
    Given the trader is connected to the pricing service
    And the EURUSD tile is loaded with live bid and ask prices
    And the notional is set to 1,000,000

  # -------------------------------------------------------------------
  # Successful buy execution
  # -------------------------------------------------------------------

  Scenario: Successful buy execution shows green confirmation
    When the trader clicks the Buy button on the EURUSD tile
    Then the tile displays an "Executing" spinner
    And the notional input is disabled
    And the bid and ask price buttons are disabled
    When the execution completes successfully
    Then the tile shows a green confirmation overlay
    And the confirmation displays "You Bought"
    And the confirmation shows the base currency "EUR" and the notional "1,000,000"
    And the confirmation shows the executed spot rate
    And the confirmation shows a settlement date
    And the confirmation shows a trade ID

  Scenario: Successful buy trade appears in the blotter
    When the trader clicks the Buy button on the EURUSD tile
    And the execution completes successfully
    Then the trade ID displayed on the tile matches a new row in the blotter

  Scenario: Buy confirmation auto-dismisses after 5 seconds
    Given the trader has executed a successful buy on EURUSD
    And the green confirmation overlay is visible
    When 5 seconds elapse without the trader dismissing it
    Then the confirmation overlay disappears
    And the tile returns to the ready state with live prices

  # -------------------------------------------------------------------
  # Successful sell execution
  # -------------------------------------------------------------------

  Scenario: Successful sell execution shows green confirmation
    When the trader clicks the Sell button on the EURUSD tile
    Then the tile displays an "Executing" spinner
    When the execution completes successfully
    Then the tile shows a green confirmation overlay
    And the confirmation displays "You Sold"
    And the confirmation shows the terms currency "USD" and the notional cost
    And the confirmation shows a trade ID

  # -------------------------------------------------------------------
  # Dealt currency
  # -------------------------------------------------------------------

  Scenario: Dealt currency is base currency when buying
    When the trader clicks the Buy button on the EURUSD tile
    And the execution completes successfully
    Then the dealt currency in the trade is "EUR"

  Scenario: Dealt currency is terms currency when selling
    When the trader clicks the Sell button on the EURUSD tile
    And the execution completes successfully
    Then the dealt currency in the trade is "USD"

  # -------------------------------------------------------------------
  # Rejected execution
  # -------------------------------------------------------------------

  Scenario: Rejected trade on GBPJPY shows red rejection message
    Given the GBPJPY tile is loaded with live prices
    When the trader clicks the Buy button on the GBPJPY tile
    Then the tile displays an "Executing" spinner
    When the server rejects the trade
    Then the GBPJPY tile shows a red confirmation overlay
    And the overlay displays "Your trade has been rejected"

  Scenario: Rejected sell trade on GBPJPY shows red rejection message
    Given the GBPJPY tile is loaded with live prices
    When the trader clicks the Sell button on the GBPJPY tile
    When the server rejects the trade
    Then the GBPJPY tile shows a red confirmation overlay
    And the overlay displays "Your trade has been rejected"

  # -------------------------------------------------------------------
  # Execution taking too long
  # -------------------------------------------------------------------

  Scenario: Warning when execution takes longer than 2 seconds
    Given the EURJPY tile is loaded with live prices
    When the trader clicks the Sell button on the EURJPY tile
    Then the tile displays an "Executing" spinner
    When 2 seconds elapse without a server response
    Then the tile shows an orange warning overlay
    And the overlay displays "Trade execution taking longer than expected"

  Scenario: Execution timeout after extended wait
    Given a trade has been submitted
    When the server does not respond within the timeout period
    Then the tile shows a timeout indicator
    And the tile eventually returns to the ready state

  # -------------------------------------------------------------------
  # User dismisses confirmation early
  # -------------------------------------------------------------------

  Scenario: Trader dismisses the success confirmation before auto-dismiss
    Given the trader has executed a successful buy on EURUSD
    And the green confirmation overlay is visible
    When the trader clicks the dismiss button on the overlay
    Then the confirmation overlay disappears immediately
    And the tile returns to the ready state with live prices

  Scenario: Trader dismisses the rejection confirmation before auto-dismiss
    Given the GBPJPY tile is showing a red rejection overlay
    When the trader clicks the dismiss button on the overlay
    Then the confirmation overlay disappears immediately
    And the tile returns to the ready state with live prices

  # -------------------------------------------------------------------
  # Controls disabled during execution
  # -------------------------------------------------------------------

  Scenario: Notional input and price buttons are disabled during execution
    When the trader clicks the Buy button on the EURUSD tile
    And the tile displays an "Executing" spinner
    Then the notional input is disabled
    And the bid and ask price buttons are disabled
    When the execution completes successfully
    Then the notional input is enabled
    And the bid and ask price buttons are enabled
