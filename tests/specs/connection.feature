Feature: Connection status

  Background:
    Given the trader has the workspace open

  @presenter
  Scenario: connected status is shown in the footer
    Then the connection status footer is visible
    And the connection status footer shows "Connected"

  @presenter
  Scenario: connection overlay is hidden when connected
    Then the connection overlay is hidden

  @presenter
  Scenario: going offline shows the overlay with an offline message
    When the browser goes offline
    Then the connection overlay becomes visible within 3 seconds
    And the connection overlay text matches /offline/i
    # offline-specific wording is asserted via the overlay text match above
    And the connection status footer shows "Disconnected"

  @presenter
  Scenario: coming back online dismisses the overlay
    When the browser goes offline
    And the connection overlay becomes visible within 3 seconds
    And the browser comes back online
    Then the connection overlay is hidden within 5 seconds
    And the connection status footer shows "Connected"

  # Presenter-only: a gateway drop/reconnect cannot be injected through the
  # browser DOM (gatewayDisconnected/reconnectAttempt originate in WsAdapter in
  # WS-real mode, or the test ConnectionEventsPort in presenter mode), so the
  # browser peers cannot exercise this transition. The two browser Cucumber
  # peers exclude it via `not @presenterOnly` (the two raw browser peers simply
  # omit it); the four presenter peers run it via the `@presenter` tag. The
  # `@presenter` tag is kept last so grep gate 21's scenario-count regex matches.
  @presenterOnly
  @presenter
  Scenario: gateway disconnect transitions through reconnecting back to connected
    When the gateway connection drops
    Then the connection status footer shows "Disconnected"
    When the gateway attempts to reconnect
    Then the connection status footer shows "Connecting..."
    When the gateway connection is restored
    Then the connection status footer shows "Connected"
