Feature: Blotter Sorting
  Users can sort the blotter by clicking column headers. Each column cycles
  through a sort direction sequence on successive clicks. Only one column
  can be actively sorted at a time.

  Background:
    Given the user is on the FX trading workspace
    And the blotter contains multiple trades

  Scenario: Default sort order is reverse chronological
    Given no column sort has been applied
    Then the blotter displays trades in natural order with newest first

  Scenario Outline: First click on a date/ID column sorts descending
    When the user clicks the "<column>" column header once
    Then the blotter sorts by "<column>" in descending order

    Examples:
      | column     |
      | Trade ID   |
      | Trade Date |
      | Value Date |

  Scenario Outline: Second click on a date/ID column sorts ascending
    Given the user has clicked the "<column>" column header once
    When the user clicks the "<column>" column header again
    Then the blotter sorts by "<column>" in ascending order

    Examples:
      | column     |
      | Trade ID   |
      | Trade Date |
      | Value Date |

  Scenario Outline: Third click on a date/ID column resets sort
    Given the user has clicked the "<column>" column header twice
    When the user clicks the "<column>" column header again
    Then the blotter returns to its default unsorted order

    Examples:
      | column     |
      | Trade ID   |
      | Trade Date |
      | Value Date |

  Scenario Outline: First click on a text column sorts ascending
    When the user clicks the "<column>" column header once
    Then the blotter sorts by "<column>" in ascending order

    Examples:
      | column    |
      | Status    |
      | Direction |
      | CCYCCY    |
      | Deal CCY  |
      | Trader    |

  Scenario Outline: Second click on a text column sorts descending
    Given the user has clicked the "<column>" column header once
    When the user clicks the "<column>" column header again
    Then the blotter sorts by "<column>" in descending order

    Examples:
      | column    |
      | Status    |
      | Direction |
      | CCYCCY    |
      | Deal CCY  |
      | Trader    |

  Scenario Outline: Third click on a text column resets sort
    Given the user has clicked the "<column>" column header twice
    When the user clicks the "<column>" column header again
    Then the blotter returns to its default unsorted order

    Examples:
      | column    |
      | Status    |
      | Direction |
      | CCYCCY    |
      | Deal CCY  |
      | Trader    |

  Scenario: Numeric columns sort by numeric comparison
    When the user clicks the "Notional" column header once
    Then the blotter sorts by "Notional" in ascending order using numeric comparison
    And the value 1,000 appears before the value 10,000

  Scenario: String columns sort by case-insensitive alphabetical comparison
    When the user clicks the "Trader" column header once
    Then the blotter sorts by "Trader" in ascending order using case-insensitive alphabetical comparison

  Scenario: Date columns sort by chronological comparison
    When the user clicks the "Trade Date" column header once
    Then the blotter sorts by "Trade Date" in descending order using chronological comparison

  Scenario: Selecting a new column replaces the current sort
    Given the blotter is sorted by "Trade ID" in descending order
    When the user clicks the "Status" column header
    Then the blotter sorts by "Status" in ascending order
    And the "Trade ID" column no longer has a sort indicator
