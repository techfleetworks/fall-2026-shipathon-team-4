# Feature index entry: extract action items (board card, ADR-013).
# Audience: patient after a visit. Items come only from the after-visit summary (the plan the clinician set,
#           what the clinician said they'd do, what wasn't covered). Diana's Next steps screen lists them.

@feature:action-items
Feature: After a visit, a short list of what happens next and who does it
  So that nothing promised or skipped gets lost
  As a patient
  I want my next steps pulled from what was actually said

  @audience:patient @usecase:ai-new-visit @category:happy-path @quality:functional @severity:high
  Scenario: The plan, the doctor's promise and what was skipped become next steps
    When action items are extracted from a visit where Dr. Kim says "Let us run a thyroid panel and an ECG today. We will follow up in two weeks."
    Then there is a step "Book a follow-up visit with Dr. Kim" for "You"
    And there is a step "Thyroid panel and an ECG" for "Dr. Kim"
    And there is a step "Ask about feeling dizzy when you stand up" for "You"

  @audience:patient @usecase:ai-already-booked @category:edge @quality:functional @severity:medium
  Scenario: A follow-up already on the calendar is not added again
    Given a visit with Dr. Kim is already booked two weeks later
    When action items are extracted from a visit where Dr. Kim says "We will follow up in two weeks."
    Then there is no step to book a follow-up

  @security @audience:patient @usecase:ai-nothing-invented @category:security @quality:safety @severity:high
  Scenario: Nothing is invented when no plan was set
    When action items are extracted from a visit where Dr. Kim says "Take care now."
    Then no follow-up or doctor task is made up
