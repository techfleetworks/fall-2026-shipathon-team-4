# Feature index entry: clinical → plain explainer (board card "Clinical → plain explainer", ADR-007).
# Audiences: patient (reads a clinical note, what the doctor said, or the app's doctor-terms lines) and
#            Product / mentor (own the glossary wording; every edit is re-checked by these rules).
# Scenarios call explainClinical() directly. Where the explanations appear on screen is Diana's call.

@feature:clinical-explainer
Feature: Clinical words and note shorthand explained in plain language, never as a diagnosis or advice
  So that I understand what my clinician wrote and what my own doctor-terms summary says
  As a patient
  I want each clinical word explained plainly, from a reviewed glossary

  @audience:patient @usecase:explain-note-shorthand @category:happy-path @quality:functional @severity:high
  Scenario: Note shorthand is explained
    When the patient asks to explain "on ziprasidone 5/52, RV in 4/52"
    Then "5/52" is explained as "5 weeks. Clinicians write weeks as a number over 52 (the weeks in a year)."
    And "RV" is explained as "Review: a follow-up visit."

  @audience:patient @usecase:explain-uncertain-term @category:happy-path @quality:functional @severity:high
  Scenario: A question mark in front of a term is explained as not confirmed
    When the patient asks to explain "?orthostatic hypotension"
    Then "?" is explained as "Query (or a \"?\" in front of a word): something being considered or checked, not confirmed."

  @audience:patient @usecase:explain-doctor-terms @category:happy-path @quality:functional @severity:high
  Scenario: The app's own doctor-terms line is explained back in plain words
    When the patient asks to explain "Over-sedation / excessive daytime somnolence"
    Then "somnolence" is explained as "Strong sleepiness or drowsiness, especially during the day."

  @audience:patient @usecase:explain-nothing @category:edge @quality:functional @severity:medium
  Scenario: Plain text needs no explanation
    When the patient asks to explain "I went to the shop and felt fine"
    Then there is nothing to explain

  @security @audience:patient @usecase:explain-no-invented-names @category:negative @quality:safety @severity:critical
  Scenario: Explanations never repeat or add medication or condition names
    When the patient asks to explain "30 y/o male, h/o mood disorder, on ziprasidone 5/52"
    Then no explanation mentions "ziprasidone"
    And no explanation mentions "disorder"

  @security @safety @audience:patient @usecase:explain-crisis @category:security @quality:safety @severity:critical
  Scenario: Crisis language takes the crisis path instead of an explanation
    When the patient asks to explain "somnolence. I don't see the point anymore"
    Then the explainer goes to the crisis path

  @security @audience:product @usecase:explain-glossary-rules @category:security @quality:safety @severity:critical
  Scenario: Every glossary explanation passes the guardrail rules on its own
    Then every glossary explanation passes the guardrail checks with nothing to echo
