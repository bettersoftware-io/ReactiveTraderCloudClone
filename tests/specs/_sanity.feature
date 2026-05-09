Feature: Test harness sanity check

  Scenario: the harness can load the home page
    When the harness loads the home page
    Then the page title is non-empty
