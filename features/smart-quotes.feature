# Feature index entry: phone-typed "smart" apostrophes and quotes (bug fix, see the PR). Audience: anyone typing on an iPhone,
# or pasting from Google Docs / Word, which turn ' into ’. The word patterns were written with straight quotes and missed them.

@feature:smart-quotes
Feature: The app understands words typed on a phone
  So that nothing I type is missed because my phone changed my apostrophes
  As a patient typing on my phone
  I want "don’t" and "can’t" to count the same as "don't" and "can't"

  @security @audience:patient @usecase:sq-crisis @category:adverse @quality:safety @severity:critical
  Scenario: A crisis phrase typed on an iPhone gets crisis support
    When I type "I don’t want to be here" with a phone apostrophe
    Then the crisis check catches it

  @audience:patient @usecase:sq-doctor-terms @category:edge @quality:functional @severity:high
  Scenario: Phone-typed symptoms become doctor terms
    When I type "I can’t sleep" with a phone apostrophe
    Then my doctor reads "Insomnia / sleep disturbance"
