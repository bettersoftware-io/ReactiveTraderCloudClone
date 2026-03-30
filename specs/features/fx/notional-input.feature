Feature: Notional Input
  As a trader
  I want to specify the notional amount for my FX trade
  So that I can control the size of my position

  Background:
    Given the trader is connected to the pricing service
    And currency pair reference data has loaded

  # -------------------------------------------------------------------
  # Default values
  # -------------------------------------------------------------------

  Scenario: Default notional for most currency pairs is 1,000,000
    Then the notional input for the following pairs displays "1,000,000":
      | pair    |
      | EURUSD  |
      | USDJPY  |
      | GBPUSD  |
      | GBPJPY  |
      | EURJPY  |
      | AUDUSD  |
      | EURCAD  |
      | EURAUD  |

  Scenario: Default notional for NZDUSD is 10,000,000
    Then the notional input for NZDUSD displays "10,000,000"

  # -------------------------------------------------------------------
  # Formatting and shorthand entry
  # -------------------------------------------------------------------

  Scenario: Notional is displayed with thousands separators
    Given the trader clears the EURUSD notional input
    When the trader types "500000" into the EURUSD notional input
    Then the EURUSD notional input displays "500,000"

  Scenario: Typing "1k" sets the notional to 1,000
    Given the trader clears the EURUSD notional input
    When the trader types "1k" into the EURUSD notional input
    Then the EURUSD notional input displays "1,000"

  Scenario: Typing "1m" sets the notional to 1,000,000
    Given the trader clears the EURUSD notional input
    When the trader types "1m" into the EURUSD notional input
    Then the EURUSD notional input displays "1,000,000"

  Scenario: Typing "5k" sets the notional to 5,000
    Given the trader clears the EURUSD notional input
    When the trader types "5k" into the EURUSD notional input
    Then the EURUSD notional input displays "5,000"

  Scenario: Typing "2.5m" sets the notional to 2,500,000
    Given the trader clears the EURUSD notional input
    When the trader types "2.5m" into the EURUSD notional input
    Then the EURUSD notional input displays "2,500,000"

  # -------------------------------------------------------------------
  # Maximum notional validation
  # -------------------------------------------------------------------

  Scenario: Entering a value exceeding 1,000,000,000 shows an error
    Given the trader clears the EURUSD notional input
    When the trader types "1200000000" into the EURUSD notional input
    Then the EURUSD tile displays the error message "Max exceeded"
    And the Buy and Sell buttons on the EURUSD tile are disabled

  Scenario: Reducing the notional below the maximum clears the error
    Given the EURUSD notional input contains a value above 1,000,000,000
    And the EURUSD tile displays the error message "Max exceeded"
    When the trader clears the EURUSD notional input
    And the trader types "1m" into the EURUSD notional input
    Then the "Max exceeded" error message is no longer displayed
    And the Buy and Sell buttons on the EURUSD tile are enabled

  Scenario: Entering exactly 1,000,000,000 does not show an error
    Given the trader clears the EURUSD notional input
    When the trader types "1000000000" into the EURUSD notional input
    Then the "Max exceeded" error message is not displayed

  # -------------------------------------------------------------------
  # RFQ threshold
  # -------------------------------------------------------------------

  Scenario: Notional at or above 10,000,000 activates RFQ mode
    Given the trader clears the EURUSD notional input
    When the trader types "10m" into the EURUSD notional input
    Then the EURUSD tile enters RFQ mode
    And the Buy and Sell buttons are replaced with an "Initiate RFQ" button

  Scenario: Notional below 10,000,000 remains in normal trading mode
    Given the EURUSD notional input is set to "9,999,999"
    Then the EURUSD tile is in normal trading mode
    And the Buy and Sell price buttons are visible

  # -------------------------------------------------------------------
  # Reset button
  # -------------------------------------------------------------------

  Scenario: Reset button appears when notional differs from the default
    Given the EURUSD tile has a default notional of 1,000,000
    When the trader changes the EURUSD notional to "500,000"
    Then a reset button is visible on the EURUSD notional input

  Scenario: Reset button is hidden when notional equals the default
    Given the EURUSD tile has a default notional of 1,000,000
    And the EURUSD notional input displays "1,000,000"
    Then the reset button is not visible on the EURUSD notional input

  Scenario: Clicking the reset button restores the default notional
    Given the trader has changed the EURUSD notional to "500,000"
    And a reset button is visible on the EURUSD notional input
    When the trader clicks the reset button
    Then the EURUSD notional input displays "1,000,000"
    And the reset button is no longer visible

  # -------------------------------------------------------------------
  # Focus behavior
  # -------------------------------------------------------------------

  Scenario: Focusing the notional input selects the entire value
    Given the EURUSD notional input displays "1,000,000"
    When the trader focuses the EURUSD notional input
    Then the entire text "1,000,000" is selected

  # -------------------------------------------------------------------
  # Input disabled during RFQ states
  # -------------------------------------------------------------------

  Scenario: Notional input is disabled during RFQ Requested state
    Given the EURUSD tile is in RFQ mode
    And the trader has clicked "Initiate RFQ"
    And the tile is in the Requested state
    Then the notional input is disabled

  Scenario: Notional input is disabled during RFQ Received state
    Given the EURUSD tile is in RFQ mode
    And a quote has been received with a countdown timer
    Then the notional input is disabled

  Scenario: Notional input is enabled in RFQ Init state
    Given the EURUSD tile is in RFQ mode
    And the tile is in the Init state showing "Initiate RFQ"
    Then the notional input is enabled

  # -------------------------------------------------------------------
  # Base currency label
  # -------------------------------------------------------------------

  Scenario Outline: Base currency label is displayed next to the notional input
    Then the notional input for <pair> shows the base currency label "<base>"

    Examples:
      | pair    | base |
      | EURUSD  | EUR  |
      | USDJPY  | USD  |
      | GBPUSD  | GBP  |
      | NZDUSD  | NZD  |
      | AUDUSD  | AUD  |
