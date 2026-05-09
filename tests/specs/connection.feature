Feature: Connection status

  Background:
    Given the trader has the workspace open

  Scenario: connected status is shown in the footer
    Then the connection status footer is visible
    And the connection status footer shows "Connected"

  Scenario: connection overlay is hidden when connected
    Then the connection overlay is hidden

  Scenario: going offline shows the overlay with an offline message
    When the browser goes offline
    Then the connection overlay becomes visible within 3 seconds
    And the connection overlay text matches /offline/i
    And the connection status footer shows "Offline"

  Scenario: coming back online dismisses the overlay
    When the browser goes offline
    And the connection overlay becomes visible within 3 seconds
    And the browser comes back online
    Then the connection overlay is hidden within 5 seconds
    And the connection status footer shows "Connected"
