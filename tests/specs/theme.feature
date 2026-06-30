Feature: Theme

  Background:
    Given the trader has the workspace open

  Scenario: theme toggle button is visible
    Then the theme toggle button is visible

  Scenario: clicking theme toggle changes the theme
    When the trader toggles the theme
    Then the workspace background color has changed

  Scenario: theme persists across page reloads
    When the trader toggles the theme
    And the trader reloads the page
    Then the workspace background color matches the toggled theme

  Scenario: toggle cycles the mode preference and updates its aria-label
    Then the theme toggle aria-label mentions "light"
    When the trader toggles the theme
    Then the theme toggle aria-label mentions "system"
    When the trader toggles the theme
    Then the theme toggle aria-label mentions "dark"

  Scenario: workspace tabs work in both themes
    When the trader switches to the "fx" tab
    Then a price tile is visible
    When the trader toggles the theme
    And the trader switches to the "credit" tab
    Then the credit navigation is visible
    When the trader switches to the "admin" tab
    And the trader switches to the "fx" tab
    Then a price tile is visible
