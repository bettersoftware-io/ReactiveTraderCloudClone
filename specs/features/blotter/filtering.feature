Feature: Blotter Filtering
  The blotter supports two filtering mechanisms: column-level filters
  (accessed via column headers) and a quick-filter free-text search.
  Filtered results can be exported to CSV.

  Background:
    Given the user is on the FX trading workspace
    And the blotter contains multiple trades

  # ---------------------------------------------------------------------------
  # Column Filters - General
  # ---------------------------------------------------------------------------

  Scenario: Filter icon appears on column header hover
    When the user hovers over any column header
    Then a filter icon is revealed on that column header

  Scenario: Clicking the filter icon opens the filter panel
    When the user clicks the filter icon on a column header
    Then the filter panel for that column opens

  # ---------------------------------------------------------------------------
  # Set Filters (Status, Direction, CCYCCY, Deal CCY, Trader)
  # ---------------------------------------------------------------------------

  Scenario Outline: Set filter displays multi-select checkboxes
    When the user opens the filter panel for the "<column>" column
    Then the panel shows a list of checkboxes
    And each checkbox represents a unique value present in that column

    Examples:
      | column    |
      | Status    |
      | Direction |
      | CCYCCY    |
      | Deal CCY  |
      | Trader    |

  Scenario: Applying a set filter shows only matching rows
    Given the user opens the filter panel for the "Status" column
    When the user deselects all values except "Done"
    Then only trades with status "Done" are visible in the blotter

  # ---------------------------------------------------------------------------
  # Number Filters (Trade ID, Notional, Rate)
  # ---------------------------------------------------------------------------

  Scenario Outline: Number filter provides comparator options
    When the user opens the filter panel for the "<column>" column
    Then the panel shows a comparator dropdown with these options:
      | Equals                |
      | Not equal             |
      | Less than             |
      | Less than or equals   |
      | Greater than          |
      | Greater than or equals|
      | In range              |
    And a numeric input field

    Examples:
      | column   |
      | Trade ID |
      | Notional |
      | Rate     |

  Scenario: Applying a number filter with "Equals" comparator
    Given the user opens the filter panel for the "Trade ID" column
    When the user selects "Equals" and enters the value 42
    Then only the trade with Trade ID 42 is visible in the blotter

  Scenario: Applying a number filter with "Greater than" comparator
    Given the user opens the filter panel for the "Notional" column
    When the user selects "Greater than" and enters the value 500000
    Then only trades with Notional greater than 500,000 are visible

  Scenario: Applying a number filter with "In range" comparator
    Given the user opens the filter panel for the "Rate" column
    When the user selects "In range" and enters a lower bound and upper bound
    Then only trades with Rate between the lower and upper bounds (inclusive) are visible

  # ---------------------------------------------------------------------------
  # Date Filters (Trade Date, Value Date)
  # ---------------------------------------------------------------------------

  Scenario Outline: Date filter provides comparator options and date input
    When the user opens the filter panel for the "<column>" column
    Then the panel shows a comparator dropdown with these options:
      | Equals                |
      | Not equal             |
      | Less than             |
      | Less than or equals   |
      | Greater than          |
      | Greater than or equals|
      | In range              |
    And a date picker input

    Examples:
      | column     |
      | Trade Date |
      | Value Date |

  Scenario: Applying a date filter with "Equals" comparator
    Given the user opens the filter panel for the "Trade Date" column
    When the user selects "Equals" and picks a specific date
    Then only trades with that exact Trade Date are visible
    And date comparison is performed at start-of-day granularity

  Scenario: Applying a date filter with "In range" comparator
    Given the user opens the filter panel for the "Value Date" column
    When the user selects "In range" and picks a start date and end date
    Then only trades with Value Date between the start and end dates (inclusive) are visible

  # ---------------------------------------------------------------------------
  # Combining Filters
  # ---------------------------------------------------------------------------

  Scenario: Multiple column filters combine with AND logic
    Given the user has applied a set filter on "Direction" selecting only "Buy"
    And the user has applied a number filter on "Notional" greater than 100000
    Then only trades that match both conditions are visible
    And a trade must have Direction "Buy" AND Notional greater than 100,000 to appear

  Scenario: Active filter indicators show which columns are filtered
    Given the user has applied a filter on the "Status" column
    Then the "Status" column displays an active filter indicator
    And the applied filter label appears in the blotter header area

  Scenario: Resetting a column filter removes it
    Given the user has applied a filter on the "Direction" column
    When the user clicks the reset control for the "Direction" filter
    Then the "Direction" filter is removed
    And trades that were hidden by that filter become visible again

  # ---------------------------------------------------------------------------
  # Quick Filter
  # ---------------------------------------------------------------------------

  Scenario: Quick filter searches across all column values
    When the user enters "EUR" into the quick filter input
    Then only rows where at least one field contains "EUR" are visible

  Scenario: Quick filter is case-insensitive
    When the user enters "done" into the quick filter input
    Then trades with status "Done" are visible

  Scenario: Quick filter supports multiple space-separated terms with AND logic
    When the user enters "Buy EUR" into the quick filter input
    Then only rows matching both "Buy" AND "EUR" across any fields are visible
    And each term must match at least one column value in the row

  Scenario: Clearing the quick filter restores all rows
    Given the user has entered a quick filter term
    When the user clears the quick filter input
    Then all trades are visible again (subject to any active column filters)

  # ---------------------------------------------------------------------------
  # CSV Export
  # ---------------------------------------------------------------------------

  Scenario: Export downloads a CSV of all trades when no filter is active
    Given no column filters or quick filters are applied
    When the user clicks the export button
    Then a CSV file named "RT-Blotter.csv" is downloaded
    And the CSV includes a header row with column names:
      | Trade ID | Status | Trade Date | Direction | CCYCCY | Deal CCY | Notional | Rate | Value Date | Trader |
    And the CSV contains one data row per trade in the blotter

  Scenario: Export downloads only filtered trades when filters are active
    Given the user has applied a set filter on "Status" selecting only "Done"
    When the user clicks the export button
    Then the downloaded CSV contains only trades with status "Done"
    And the first data row corresponds to the first visible row in the blotter

  Scenario: CSV uses appropriate value formatters
    When the user exports the blotter to CSV
    Then the "Notional" column values in the CSV are unformatted integers without thousands separators
    And all other columns use their standard display formatters
