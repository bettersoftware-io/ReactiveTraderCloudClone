Feature: Trade Blotter Display
  The FX blotter is a grid showing trade history with real-time updates.
  It streams trades from the backend and displays them in a tabular format
  with ten columns, each formatted according to its data type.

  Background:
    Given the user is on the FX trading workspace
    And the blotter is visible

  Scenario: Blotter displays all trades from the trade stream
    Given the trade stream has delivered a state-of-the-world snapshot
    Then every trade in the snapshot is displayed as a row in the blotter
    And the blotter shows the following columns in order:
      | Column     | Filter Type | Alignment |
      | Trade ID   | number      | left      |
      | Status     | set         | left      |
      | Trade Date | date        | left      |
      | Direction  | set         | left      |
      | CCYCCY     | set         | left      |
      | Deal CCY   | set         | left      |
      | Notional   | number      | left      |
      | Rate       | number      | left      |
      | Value Date | date        | left      |
      | Trader     | set         | left      |

  Scenario: Column values are formatted correctly
    Given the blotter contains at least one trade
    Then the "Trade ID" column displays integer values
    And the "Status" column displays capitalized values from the set:
      | Done     |
      | Rejected |
    And the "Trade Date" column is formatted as "dd-MMM-yyyy"
    And the "Direction" column displays values from the set:
      | Buy  |
      | Sell |
    And the "CCYCCY" column displays a currency pair symbol such as "EURUSD"
    And the "Deal CCY" column displays the dealt currency code
    And the "Notional" column displays numbers with thousands separators
    And the "Rate" column displays numbers formatted to 6 significant digits
    And the "Value Date" column is formatted as "dd-MMM-yyyy"
    And the "Trader" column displays the trader name

  Scenario: Trades appear in reverse chronological order
    Given the trade stream has delivered multiple trades
    Then the blotter displays trades with the newest trade first
    And the oldest trade appears last

  Scenario: New trade appears at the top of the blotter
    Given the blotter is displaying existing trades
    When a new trade is executed
    Then the new trade appears as the first row in the blotter

  Scenario: New trade row flashes with a highlight animation
    Given the blotter is displaying existing trades
    When a new trade is executed
    Then the new trade row is highlighted with a background flash animation
    And the animation uses a 1-second ease-in-out timing function
    And the animation repeats 3 times for a total duration of 3 seconds
    And after 3 seconds the row returns to its normal background color

  Scenario: Row highlights on hover
    Given the blotter contains at least one trade
    When the user hovers over a trade row
    Then that row displays a different background color
    When the user moves the cursor away from the row
    Then the row returns to its normal background color

  Scenario: Rejected trade row shows a strikethrough
    Given a trade has a status of "Rejected"
    Then the trade row displays a red strikethrough line across its content

  Scenario: Blotter shows stale data indicator when connection is lost
    Given the blotter is displaying trades
    When the WebSocket connection is lost
    Then the blotter displays a stale data indicator

  Scenario: Blotter replaces all trades with fresh data on reconnection
    Given the WebSocket connection was lost
    And the blotter is showing stale data
    When the connection is re-established
    And the trade stream delivers a new state-of-the-world snapshot
    Then the blotter replaces all previously displayed trades with the fresh snapshot
    And the stale data indicator is removed
