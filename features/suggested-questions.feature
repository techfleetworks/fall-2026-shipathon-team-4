# Feature index entry: suggested questions from goal + history (board card, ADR-012).
# Audience: patient preparing for the next visit. Every question comes from their own record (what wasn't covered
#           last time, their timeline, what the last visit concluded, the plan). Never advice, never a medicine name.
# Scenarios call suggestQuestions directly with Theo's server record. The talking-points chips show them.

@feature:suggested-questions
Feature: Questions for my next visit, from what already happened
  So that I go back better prepared and get heard this time
  As a patient
  I want questions built from my own record, with the reason for each

  @audience:patient @usecase:sq-not-covered @category:happy-path @quality:functional @severity:high
  Scenario: What the doctor skipped last time becomes a question
    When questions are suggested for Theo's next visit
    Then one question is "Last time we did not talk about feeling dizzy when I stand up. Can we talk about it today?"
    And its reason is "Not covered at your visit on" his last visit date

  @audience:patient @usecase:sq-timeline @category:happy-path @quality:functional @severity:high
  Scenario: The timeline points at the medicine
    When questions are suggested for Theo's next visit
    Then one question is "This started right after my medicine changed. Could the medicine be causing it?"

  @audience:patient @usecase:sq-no-duplicates @category:edge @quality:functional @severity:medium
  Scenario: A question Theo already has is not suggested again
    When questions are suggested for Theo's next visit
    Then no question starts with "What are my choices"

  @security @audience:patient @usecase:sq-grounded @category:security @quality:safety @severity:high
  Scenario: Nothing is invented for someone with no history
    When questions are suggested for a new patient with no history
    Then there are no suggestions
