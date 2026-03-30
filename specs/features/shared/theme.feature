Feature: Theme Switching

  The application supports light and dark color themes.

  Background:
    Given the application is loaded

  Scenario: Default theme
    Then the application should render with the default theme (dark)

  Scenario: Toggle to light theme
    Given the current theme is dark
    When the user clicks the theme switcher in the header
    Then the application should switch to the light theme
    And all components should update their colors accordingly

  Scenario: Toggle back to dark theme
    Given the current theme is light
    When the user clicks the theme switcher in the header
    Then the application should switch to the dark theme

  Scenario: Theme affects all sections
    When the user switches the theme
    Then the tile grid, blotter, analytics, header, and footer should all reflect the new theme
    And price movement indicators, confirmation overlays, and status colors should adapt to the theme
