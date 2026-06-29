Feature: Admin incident injection breaks the live connection

  @presenter
  Scenario: Injecting a service-down incident disconnects the app
    Given the app is connected
    When the operator injects a "serviceDown" incident from the admin panel
    Then the connection banner shows a disconnection
    When the operator clears the incident
    Then the connection is restored
