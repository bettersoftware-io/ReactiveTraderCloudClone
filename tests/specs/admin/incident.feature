Feature: Admin incident injection breaks the live connection

  # Browser peers exclude this via `not @presenterOnly`; the presenter peers run
  # it via the `@presenter` tag (kept last for grep gate 21's scenario-count regex).
  # Browser coverage of the incident flow lives in adminIncident.spec.ts (native Playwright).
  @presenterOnly
  @presenter
  Scenario: Injecting a service-down incident disconnects the app
    Given the app is connected
    When the operator injects a "serviceDown" incident from the admin panel
    Then the connection banner shows a disconnection
    When the operator clears the incident
    Then the connection is restored
