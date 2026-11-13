# Feature index entry: plain-language explainer on labs & notes (board card, ADR-008).
# Audiences: patient (reads their lab results and clinical note) and the request itself (untrusted input:
#            interpretation text, odd ranges and crisis words must not leak or mislead).
# Scenarios call explainLab / explainResults directly. Screen placement is Diana's call.

@feature:results-explainer
Feature: Lab results and clinical notes in plain language, compared only against the range shown
  So that I understand my results before or after a visit without being told what they mean for me
  As a patient
  I want each result placed against the range on my report, and each note term explained

  @audience:patient @usecase:labs-above-range @category:happy-path @quality:functional @severity:high
  Scenario: A value above the range shown
    When the patient's "Fasting glucose" result "104 mg/dL" with range "70-99" is explained
    Then it is placed "above" with "104 mg/dL is above the typical range shown (70-99)."

  @audience:patient @usecase:labs-change @category:happy-path @quality:functional @severity:high
  Scenario: A sitting-to-standing blood pressure is described as a change, not judged
    When the patient's "Blood pressure (sitting -> standing)" result "118/76 -> 98/64 mmHg" with range "small drop" is explained
    Then it is placed "change" with "The top number went from 118 to 98 (down 20), and the bottom number from 76 to 64 (down 12)."

  @audience:patient @usecase:labs-no-range @category:edge @quality:functional @severity:medium
  Scenario: A result with no range is not compared
    When the patient's "Weight change" result "+11 lb in 5 weeks" with range "—" is explained
    Then it is placed "no-range" with "No typical range was given for this result, so it isn’t compared."

  @security @audience:patient @usecase:labs-unit-mismatch @category:negative @quality:safety @severity:high
  Scenario: Different units are never compared
    When the patient's "Fasting glucose" result "5.8 mmol/L" with range "70-99 mg/dL" is explained
    Then it is placed "not-compared" with "This result couldn’t be compared with the range shown. Your clinician can explain it."

  @audience:patient @usecase:results-labs-and-note @category:happy-path @quality:functional @severity:high
  Scenario: Theo's labs and clinical note are explained together
    When Theo's labs and clinical note are explained
    Then 5 lab results and the note term "orthostatic hypotension" are explained

  @security @safety @audience:patient @usecase:results-crisis @category:security @quality:safety @severity:critical
  Scenario: Crisis words in the note take the crisis path for the whole request
    When Theo's labs are explained with the note "I want to hurt myself"
    Then the results go to the crisis path
