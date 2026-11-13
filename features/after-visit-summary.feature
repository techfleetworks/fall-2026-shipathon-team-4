# Feature index entry: plain-language after-visit summary from the transcript (board card, ADR-011).
# Audience: patient, after a visit that was recorded and transcribed (Theo's transcript.txt in the demo),
#           or after a visit with only quick notes. The summary runs the translation pairs in reverse:
#           clinical words -> the patient's kind of words, at a 6th-grade reading level or below.
# Scenarios call summarizeVisit / summarizeNotes directly. Diana's Recap screen shows the result.

@feature:after-visit-summary
Feature: After a visit, a short plain-language summary of what happened
  So that I understand what my doctor said and what was left out
  As a patient
  I want the visit in simple words: what I raised, what the doctor said, the plan, and what wasn't covered

  @audience:patient @usecase:avs-theo @category:happy-path @quality:functional @severity:high
  Scenario: Theo's visit with Dr. Lane in plain words
    When Theo's visit transcript is summarized
    Then the summary says "The doctor thinks this is from the depression."
    And the plan says "Check again next month."
    And it notes "The doctor did not talk about feeling dizzy when you stand up."
    And it reads at a 6th-grade level or below

  @audience:patient @usecase:avs-reverse-pairs @category:happy-path @quality:functional @severity:high
  Scenario: Clinical words the doctor used come back in the patient's kind of words
    When a visit where the doctor says "This looks like orthostatic hypotension." is summarized
    Then the summary says "feeling dizzy when you stand up"
    And the summary never says "orthostatic"

  @security @audience:patient @usecase:avs-no-advice @category:security @quality:safety @severity:critical
  Scenario: The summary reports, it never adds advice or names the medicine
    When Theo's visit transcript is summarized
    Then the summary never says "ziprasidone"
    And the summary never says "you should"

  @security @safety @audience:patient @usecase:avs-crisis @category:security @quality:safety @severity:critical
  Scenario: Crisis language goes to crisis support instead of a summary
    When a visit where the patient says "I want to hurt myself" is summarized
    Then the summary goes to the crisis path

  @audience:patient @usecase:avs-notes @category:edge @quality:functional @severity:medium
  Scenario: No recording, only quick notes
    When the quick notes "follow up in 4 weeks" are summarized
    Then the plan says "Check again in 4 weeks."
