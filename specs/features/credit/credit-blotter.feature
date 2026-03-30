Feature: Credit Trade Blotter
  As a trader
  I want to view all my executed credit trades in a blotter
  So that I can track my trading activity

  Background:
    Given the trader is connected to the credit service
    And there are accepted credit RFQs that have generated trades

  # -------------------------------------------------------------------
  # Blotter columns
  # -------------------------------------------------------------------

  Scenario: Credit blotter displays all required columns in order
    Then the credit blotter displays the following columns in order:
      | Column       | Filter Type   | Alignment    |
      | Trade ID     | number filter | left-aligned |
      | Status       | set filter    |              |
      | Trade Date   | date filter   |              |
      | Direction    | set filter    |              |
      | Counterparty | set filter    |              |
      | CUSIP        | set filter    |              |
      | Security     | set filter    |              |
      | Quantity     | number filter |              |
      | Order Type   | set filter    |              |
      | Unit Price   | number filter |              |

  # -------------------------------------------------------------------
  # Trade data display
  # -------------------------------------------------------------------

  Scenario: Credit blotter displays all accepted trades
    Given 3 RFQs have been accepted
    Then the credit blotter displays 3 trade rows

  Scenario: Trades appear in reverse chronological order
    Given multiple trades have been executed at different times
    Then the newest trade appears at the top of the blotter
    And the oldest trade appears at the bottom

  Scenario: Trade data is derived from the accepted RFQ
    Given an RFQ with ID 42 was accepted with the following details:
      | Field            | Value                    |
      | Instrument Name  | ORCL 4.755 08/15/2026    |
      | Instrument CUSIP | 68389X105                |
      | Instrument Ticker| ORCL                     |
      | Direction        | Buy                      |
      | Quantity         | 500,000                  |
      | Accepted Dealer  | J.P. Morgan              |
      | Accepted Price   | 102                      |
    Then the blotter row displays:
      | Column       | Value       |
      | Trade ID     | 42          |
      | Status       | Accepted    |
      | Trade Date   | <today>     |
      | Direction    | Buy         |
      | Counterparty | J.P. Morgan |
      | CUSIP        | 68389X105   |
      | Security     | ORCL        |
      | Quantity     | 500,000     |
      | Order Type   | AON         |
      | Unit Price   | $102        |

  # -------------------------------------------------------------------
  # Formatting
  # -------------------------------------------------------------------

  Scenario: Status is displayed capitalized
    Given a trade exists with accepted status
    Then the Status column displays "Accepted"

  Scenario: Trade date is formatted as dd-MMM-yyyy
    Given a trade was executed on March 15, 2024
    Then the Trade Date column displays "15-Mar-2024"

  Scenario: Quantity is formatted with thousands separators
    Given a trade has a quantity of 1500000
    Then the Quantity column displays "1,500,000"

  Scenario: Unit price is formatted with dollar sign
    Given a trade has a unit price of 102
    Then the Unit Price column displays "$102"

  Scenario: Order type is always AON
    Given any credit trade exists
    Then the Order Type column displays "AON"

  # -------------------------------------------------------------------
  # New trade highlight
  # -------------------------------------------------------------------

  Scenario: New trade row highlights briefly
    When a quote is accepted and a new trade appears in the blotter
    Then the new row is highlighted
    And the highlight fades after 3 seconds

  # -------------------------------------------------------------------
  # Sorting, filtering, and export
  # -------------------------------------------------------------------

  Scenario: Credit blotter supports column sorting
    When the trader clicks on a column header
    Then the blotter rows are sorted by that column
    And clicking again reverses the sort order

  Scenario: Credit blotter supports column filtering
    When the trader applies a filter on the "Counterparty" column
    Then only trades matching the filter criteria are displayed

  Scenario: Credit blotter supports data export
    When the trader exports the blotter data
    Then the trade data is exported in the same format as the FX blotter

  # -------------------------------------------------------------------
  # Real-time updates
  # -------------------------------------------------------------------

  Scenario: Trade appears when a quote is accepted
    Given an RFQ is in Open state with priced dealer quotes
    When the trader accepts a quote on the RFQ
    Then a new trade row immediately appears in the credit blotter
    And the row contains data derived from the accepted RFQ and quote
