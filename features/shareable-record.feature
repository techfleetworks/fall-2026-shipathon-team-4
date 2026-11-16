# Feature index entry: the shareable record (board card "Simple visit store (the compounding record) ... featuring shareable
# record", ADR-020). The patient can include their case history (the case in doctor terms, ADR-017) in a doctor link
# (ADR-009). It is a frozen snapshot, stored encrypted (ADR-018 key), bound to its link.
# Audience: the patient sharing, the clinician opening the link.
# Scenarios drive the real Express app with an in-memory share store wrapped in encryption.

@feature:shareable-record
Feature: Sharing my case history with my doctor, as a snapshot
  So that my doctor sees what keeps happening, with dates, in their terms
  As a patient
  I want to choose to include my case history in a link, and have it stored safely

  @audience:clinician @usecase:sr-doctor-sees-case @category:happy-path @quality:functional @severity:high
  Scenario: The doctor sees the case history the patient included
    Given the patient shares a brief with their case history with Dr. Lane
    When Dr. Lane opens the link
    Then Dr. Lane sees the pattern "Temporal association only"
    And Dr. Lane sees a past visit with "Dr. Lane"

  @audience:patient @usecase:sr-opt-in @category:happy-path @quality:privacy @severity:high
  Scenario: Without choosing it, no case history is shared
    Given the patient shares a brief without their case history with Dr. Lane
    When Dr. Lane opens the link
    Then Dr. Lane sees no case history

  @security @audience:patient @usecase:sr-encrypted @category:security @quality:privacy @severity:critical
  Scenario: The stored snapshot is encrypted
    Given the patient shares a brief with their case history with Dr. Lane
    Then the stored brief does not contain "somnolence"

  @security @audience:patient @usecase:sr-crisis @category:adverse @quality:safety @severity:critical
  Scenario: Crisis language in the case history means nothing is shared
    When the patient tries to share a case history containing "I want to hurt myself"
    Then the answer is crisis support and nothing is shared
