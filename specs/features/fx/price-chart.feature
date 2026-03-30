Feature: Price Chart
  As a trader
  I want to see a historical price chart on each tile
  So that I can quickly assess the recent price trend for a currency pair

  Background:
    Given the trader is connected to the pricing service
    And historical price data has loaded for all currency pairs

  # -------------------------------------------------------------------
  # Chart display
  # -------------------------------------------------------------------

  Scenario: Historical price chart is visible in chart view
    Given the tiles are in chart view
    Then each tile displays a line chart showing recent price history

  Scenario: Chart renders the last 50 price ticks
    Given the pricing service has delivered at least 50 historical ticks for EURUSD
    Then the EURUSD chart plots 50 data points as a continuous line
    And each data point represents the mid price at that tick

  Scenario: Chart renders fewer than 50 ticks when history is short
    Given the pricing service has delivered 20 historical ticks for EURUSD
    Then the EURUSD chart plots 20 data points as a continuous line

  # -------------------------------------------------------------------
  # Real-time updates (rolling window)
  # -------------------------------------------------------------------

  Scenario: Chart updates when a new price tick arrives
    Given the EURUSD chart is displaying 50 data points
    When a new price tick arrives for EURUSD
    Then the chart adds the new data point to the right end
    And the oldest data point is removed from the left end
    And the chart continues to display exactly 50 data points

  Scenario: Chart grows until it reaches the 50-tick window
    Given the EURUSD chart is displaying 30 data points
    When a new price tick arrives for EURUSD
    Then the chart displays 31 data points
    And no data points are removed

  # -------------------------------------------------------------------
  # View toggle
  # -------------------------------------------------------------------

  Scenario: Charts are hidden in price view
    Given the tiles are in chart view and charts are visible
    When the trader clicks the view toggle in the Live Rates header
    Then the tiles switch to price view
    And the historical price charts are hidden on all tiles

  Scenario: Charts reappear when toggling back to chart view
    Given the tiles are in price view and charts are hidden
    When the trader clicks the view toggle in the Live Rates header
    Then the tiles switch to chart view
    And each tile displays its historical price chart

  # -------------------------------------------------------------------
  # Chart rendering
  # -------------------------------------------------------------------

  Scenario: Chart shows a smooth price trend line
    Given the EURUSD tile is in chart view
    Then the chart renders a smooth curved line using the mid price values
    And the chart fills the designated chart area on the tile
