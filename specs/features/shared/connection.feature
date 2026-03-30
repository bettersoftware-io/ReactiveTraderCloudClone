Feature: Connection Management

  The application maintains a persistent connection to the trading gateway.
  Connection state affects all data streams and user interactions.

  Background:
    Given the application is configured with a gateway URL

  # --- Connection Lifecycle ---

  Scenario: Initial connection
    When the application starts
    Then the connection status should be "Connecting"
    And the status bar should show a connecting indicator
    When the gateway reports connected
    Then the connection status should be "Connected"
    And all data streams should begin receiving updates

  Scenario: Auto-reconnect on disconnection
    Given the connection status is "Connected"
    When the gateway connection drops
    Then the connection status should be "Disconnected"
    And a disconnection overlay should appear over the application
    And the gateway should attempt to reconnect after 10 seconds
    When the reconnection succeeds
    Then the connection status should be "Connected"
    And the disconnection overlay should disappear
    And all subscriptions should receive a fresh State-of-the-World

  # --- Idle Timeout ---

  Scenario: Idle disconnection after 15 minutes
    Given the connection status is "Connected"
    When no mouse movement is detected for 15 minutes
    Then the connection should be terminated
    And the connection status should be "Idle Disconnected"
    And the application should display an idle disconnection message

  Scenario: Reconnect from idle disconnection
    Given the connection status is "Idle Disconnected"
    When the user moves the mouse or clicks the reconnect button
    Then the application should initiate a new connection
    And the connection status should transition to "Connecting"

  Scenario: Idle timer resets on reconnection
    Given the connection status is "Connected"
    And the user has been idle for 10 minutes
    When the connection drops and auto-reconnects
    Then the idle timer should restart from zero

  Scenario: Idle disconnected takes precedence over gateway disconnected
    Given the connection status is "Idle Disconnected"
    When the gateway fires a "Disconnected" status immediately after
    Then the connection status should remain "Idle Disconnected"

  # --- Offline Detection ---

  Scenario: Browser goes offline
    Given the connection status is "Connected"
    When the browser loses network connectivity
    Then the connection status should be "Offline Disconnected"
    And a disconnection overlay should appear

  Scenario: Browser comes back online
    Given the connection status is "Offline Disconnected"
    When the browser regains network connectivity
    Then the application should use the latest gateway connection status
    And if the gateway is connected, data streams should resume

  # --- Stale Data ---

  Scenario: Stale data detection after reconnection
    Given the application was previously receiving price updates
    When the connection drops and reconnects
    Then data received before the reconnection is considered stale
    And tiles and blotter should show a stale/loading indicator
    When fresh data arrives from the new connection
    Then the stale indicators should disappear
    And the latest data should be displayed

  # --- Status Bar ---

  Scenario: Connection status displayed in footer
    Given the application footer is visible
    Then the status bar should show the current connection state
    And the status indicator should update in real-time as the connection state changes
