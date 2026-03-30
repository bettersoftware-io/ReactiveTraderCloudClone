Feature: FX Live Rates
  As a trader
  I want to see real-time FX prices for all available currency pairs
  So that I can monitor the market and identify trading opportunities

  Background:
    Given the trader is connected to the pricing service
    And all currency pair reference data has loaded

  # -------------------------------------------------------------------
  # Tile grid layout
  # -------------------------------------------------------------------

  Scenario: All currency pairs are displayed on the Live Rates grid
    Then the Live Rates grid displays 9 tiles
    And the following currency pairs are shown:
      | pair    | base | terms |
      | EURUSD  | EUR  | USD   |
      | USDJPY  | USD  | JPY   |
      | GBPUSD  | GBP  | USD   |
      | GBPJPY  | GBP  | JPY   |
      | EURJPY  | EUR  | JPY   |
      | AUDUSD  | AUD  | USD   |
      | NZDUSD  | NZD  | USD   |
      | EURCAD  | EUR  | CAD   |
      | EURAUD  | EUR  | AUD   |

  Scenario: Each tile displays the essential pricing elements
    Then every tile shows:
      | element              | example for EURUSD           |
      | currency pair label  | EUR/USD                      |
      | bid price            | the current bid rate         |
      | ask price            | the current ask rate         |
      | spread               | the pip difference bid-to-ask|
      | notional input       | 1,000,000                    |
      | base currency label  | EUR                          |

  # -------------------------------------------------------------------
  # Real-time price updates
  # -------------------------------------------------------------------

  Scenario: Prices update in real-time with an upward movement indicator
    Given the EURUSD tile is displaying a mid price of 1.10550
    When a new price tick arrives with a mid price of 1.10560
    Then the EURUSD tile updates the bid and ask prices
    And the tile shows an upward movement indicator

  Scenario: Prices update in real-time with a downward movement indicator
    Given the EURUSD tile is displaying a mid price of 1.10550
    When a new price tick arrives with a mid price of 1.10540
    Then the EURUSD tile updates the bid and ask prices
    And the tile shows a downward movement indicator

  Scenario: Spread is calculated and displayed between bid and ask
    Given the EURUSD tile has a bid of 1.10545 and an ask of 1.10560
    And EURUSD has a rate precision of 5 and a pips position of 4
    Then the spread displayed on the EURUSD tile is "1.5"

  # -------------------------------------------------------------------
  # Currency filtering
  # -------------------------------------------------------------------

  Scenario: All tiles shown by default
    When the "All" filter is selected
    Then the Live Rates grid displays 9 tiles

  Scenario Outline: Filtering tiles by currency
    When the trader selects the "<currency>" filter tab
    Then the Live Rates grid displays <count> tiles
    And every visible tile contains "<currency>" in its currency pair

    Examples:
      | currency | count |
      | EUR      | 4     |
      | USD      | 5     |
      | GBP      | 2     |
      | AUD      | 2     |
      | NZD      | 1     |

  Scenario: Selecting a filter and then returning to All
    Given the trader has selected the "EUR" filter tab
    And the Live Rates grid displays 4 tiles
    When the trader selects the "All" filter tab
    Then the Live Rates grid displays 9 tiles

  # -------------------------------------------------------------------
  # Price view vs. graph view toggle
  # -------------------------------------------------------------------

  Scenario: Default view is chart view
    When the Live Rates grid loads
    Then each tile displays a historical price chart

  Scenario: Toggling from chart view to price view
    Given the tiles are in chart view
    When the trader clicks the view toggle in the Live Rates header
    Then each tile displays the standard bid/ask price layout
    And the historical price charts are hidden

  Scenario: Toggling from price view back to chart view
    Given the tiles are in price view
    When the trader clicks the view toggle in the Live Rates header
    Then each tile displays a historical price chart

  Scenario: View preference persists across sessions
    Given the trader has toggled to price view
    When the trader reloads the application
    Then the tiles are displayed in price view

  # -------------------------------------------------------------------
  # Connection and staleness
  # -------------------------------------------------------------------

  Scenario: Tiles show a stale indicator when the connection is lost
    Given the tiles are displaying live prices
    When the connection to the pricing service is lost
    Then every tile shows a stale data indicator
    And the bid and ask price buttons are disabled

  Scenario: Tiles recover after reconnection with fresh data
    Given the tiles are showing a stale data indicator
    When the connection to the pricing service is restored
    And fresh price ticks arrive for each currency pair
    Then the stale data indicator is removed
    And the bid and ask price buttons are enabled

  Scenario: Tiles remain stale until fresh data arrives after reconnection
    Given the tiles are showing a stale data indicator
    When the connection to the pricing service is restored
    But no fresh price ticks have arrived yet
    Then the tiles continue to show the stale data indicator
