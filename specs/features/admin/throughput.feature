Feature: Admin Throughput Control

  The admin panel allows controlling the rate of price updates from the server.

  Background:
    Given the user has navigated to the admin page

  Scenario: Display current throughput
    When the admin panel loads
    Then it should fetch the current throughput from the server
    And display the value in the number input field
    And the slider should reflect the same value

  Scenario: Adjust throughput via slider
    Given the current throughput is displayed
    When the user drags the slider to a new position
    Then the number input should update to match the slider value
    And after a 300ms debounce, the new value should be sent to the server
    And a success message should appear: "Throughput has been set to {value}"
    And the success message should disappear after 3 seconds

  Scenario: Adjust throughput via number input
    Given the current throughput is displayed
    When the user types a new value in the number input
    Then the slider should update to match the input value
    And after a 300ms debounce, the new value should be sent to the server

  Scenario: Throughput range
    Then the slider minimum should be 0
    And the slider maximum should be 1,000
    And the slider step should be 10
    And the unit label should display "Updates/sec"

  Scenario: Server error
    Given the user adjusts the throughput
    When the server returns an error
    Then an error message should appear: "Error setting throughput"
    And the error message should have a red/error background
    And the message should disappear after 3 seconds

  Scenario: Rapid adjustments are debounced
    When the user moves the slider rapidly
    Then only the final value should be sent to the server after 300ms of inactivity
    And intermediate values should not trigger server requests
