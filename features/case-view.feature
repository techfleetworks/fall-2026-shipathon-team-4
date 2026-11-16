# Feature index entry: case view, patterns across visits (board card "Clinically-legible case view", ADR-017).
# Audience: patient reviewing their history (My history), and a brand-new real user with an empty history.
# Every item comes from the patient's own dated entries and points back to them. Timing only, never cause.
# Scenarios call buildCaseView directly (the My history panel runs the same function on the device).

@feature:case-view
Feature: Patterns across my visits, from my own dates
  So that I can show my doctor what keeps happening, with dates
  As a patient
  I want the app to line up my medicines, symptoms and visits and point out what repeats

  @audience:patient @usecase:cv-timing @category:happy-path @quality:functional @severity:high
  Scenario: A symptom that began soon after a medication change is shown with both dates
    When the case view is built for Theo
    Then a pattern says "That was 2 days after a medication change"
    And that pattern points to 2 entries in his record

  @audience:patient @usecase:cv-raised-again @category:happy-path @quality:functional @severity:medium
  Scenario: A concern raised at more than one visit is shown
    When the case view is built for Theo
    Then a pattern says "at 2 visits"

  @audience:new-user @usecase:cv-empty @category:empty @quality:functional @severity:high
  Scenario: A brand-new user sees an honest empty state, not made-up patterns
    When the case view is built for a new user with no history
    Then there is not enough history yet
    And there are no patterns, open questions or key dates

  @audience:patient @usecase:cv-old-change @category:boundary @quality:functional @severity:medium
  Scenario: A medication change long before a symptom is not linked
    When the case view is built for a medication change on "2026-01-01" and a symptom on "2026-06-01"
    Then there are no patterns

  @security @audience:patient @usecase:cv-no-cause @category:security @quality:safety @severity:high
  Scenario: The case view never says a medicine caused anything
    When the case view is built for Theo
    Then no line says "cause", "because", "due to" or "side effect"

  @security @audience:patient @usecase:cv-crisis @category:adverse @quality:safety @severity:critical
  Scenario: Crisis language in the record goes to crisis support, with no patterns
    When the case view is built for a record with a note "I want to hurt myself"
    Then the result is the crisis path
