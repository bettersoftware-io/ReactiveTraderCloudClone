Feature: Analytics - Profit and Loss
  The analytics panel displays real-time profit-and-loss data including
  a historical P&L line chart, the latest P&L value, currency position
  bubbles, and a per-currency-pair P&L breakdown.

  Background:
    Given the user is on the FX trading workspace
    And the analytics panel is visible

  # ---------------------------------------------------------------------------
  # P&L Line Chart
  # ---------------------------------------------------------------------------

  Scenario: P&L line chart displays historical data
    Given the analytics service is streaming history data
    Then a line chart is displayed showing P&L values over time
    And the chart plots approximately 90 data points

  Scenario: P&L chart updates periodically
    Given the P&L line chart is displayed
    When 10 seconds elapse
    Then a new data point is appended to the chart
    And the oldest data point is removed
    And the chart shifts to reflect the updated time window

  Scenario: P&L chart values follow a random walk
    Given the analytics service has produced an initial P&L value
    Then each subsequent value is derived by applying a small random percentage change to the previous value

  # ---------------------------------------------------------------------------
  # Last P&L Value
  # ---------------------------------------------------------------------------

  Scenario: Most recent P&L amount is displayed
    Given the analytics service is streaming history data
    Then the most recent P&L value is displayed as a formatted number prefixed with "USD"

  Scenario: Positive P&L is displayed with buy color
    Given the most recent P&L value is positive
    Then the value is displayed with a "+" prefix
    And the value is styled with the buy/positive color

  Scenario: Negative P&L is displayed with sell color
    Given the most recent P&L value is negative
    Then the value is displayed with a "-" prefix
    And the value is styled with the sell/negative color

  Scenario: P&L value is formatted as a whole number with commas
    Given the most recent P&L value is 12345
    Then the displayed value includes thousands separators

  Scenario: P&L value updates as new data arrives
    Given the last P&L value is displayed
    When the analytics service emits a new history update
    Then the displayed value updates to reflect the latest entry

  # ---------------------------------------------------------------------------
  # Positions Bubble Chart
  # ---------------------------------------------------------------------------

  Scenario: Bubble chart displays a bubble for each currency with a position
    Given the analytics service is providing position data
    Then the bubble chart displays one bubble for each currency that has a non-zero position
    And currencies may include: NZD, USD, JPY, GBP, EUR, CAD, AUD

  Scenario: Each bubble is labeled with its currency code
    Given the bubble chart is displayed
    Then each bubble shows a text label with the currency code

  Scenario: Positive position bubbles use buy color
    Given a currency has a positive traded amount
    Then its bubble is styled with the buy/positive color

  Scenario: Negative position bubbles use sell color
    Given a currency has a negative traded amount
    Then its bubble is styled with the sell/negative color

  Scenario: Bubble size represents relative position magnitude
    Given two currencies have different absolute position sizes
    Then the currency with the larger absolute position has a larger bubble
    And bubble radii scale linearly between a minimum of 15 pixels and a maximum of 60 pixels

  Scenario: Hovering over a bubble shows a tooltip
    When the user hovers over a currency bubble
    Then a tooltip appears displaying the currency code followed by the formatted amount
    And the tooltip text follows the pattern "{CURRENCY} {amount}"
    And the amount is formatted as a whole number with commas

  Scenario: Bubbles can be dragged to different positions
    When the user drags a bubble to a new location
    Then the bubble moves to follow the drag
    And the tooltip remains visible during the drag
    When the user releases the bubble
    Then the bubble drifts back toward the center of the chart

  # ---------------------------------------------------------------------------
  # P&L Per Currency Pair
  # ---------------------------------------------------------------------------

  Scenario: P&L breakdown is shown for each currency pair
    Given the analytics service is providing position data
    Then the P&L section displays a bar for each of the following currency pairs:
      | EUR/USD |
      | USD/JPY |
      | GBP/USD |
      | GBP/JPY |
      | EUR/JPY |
      | AUD/USD |
      | NZD/USD |
      | EUR/CAD |

  Scenario: Each currency pair shows its P&L value with abbreviated notation
    Given a currency pair has a P&L of 1234
    Then the displayed value is "1k"
    And for a P&L of 12345678 the displayed value is "12,346k"

  Scenario: Hovering over a P&L bar value shows the precise amount
    When the user hovers over a currency pair P&L value
    Then the display switches to a precise number formatted to 2 decimal places

  Scenario: P&L bar direction reflects the sign of the value
    Given a currency pair has a positive P&L
    Then its indicator bar extends to the right of the center line
    Given a currency pair has a negative P&L
    Then its indicator bar extends to the left of the center line

  Scenario: Analytics panel shows stale data indicator when connection is lost
    Given the analytics panel is displaying data
    When the WebSocket connection is lost
    Then the analytics panel displays a stale data indicator
    When the connection is re-established
    Then the stale data indicator is removed
