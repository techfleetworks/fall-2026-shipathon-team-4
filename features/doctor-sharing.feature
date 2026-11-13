# Feature index entry: 1-page doctor briefing + sharing with the care team (board card "1-page doctor briefing", ADR-009).
# Audiences: patient (shares and stops sharing), clinician (opens a link on their own device, no sign-in),
#            another patient (must never reach someone else's links), and Diana's screens (type-DELETE confirm is UI).
# Team notes (Nov 12): email the link; one link per person (PCP, therapist, psychiatrist…); stop one without
# affecting others; deleting the account stops all shares.
# Scenarios run the real Express app with an in-memory store (same behavior as the Supabase tables).

@feature:doctor-sharing
Feature: Share a one-page brief with each member of my care team, and stop any one of them
  So that my doctor can read my brief on their own device, and I stay in control of who can see it
  As a patient
  I want one expiring link per person that I can turn off individually

  Background:
    Given Alice is signed in

  @audience:clinician @usecase:share-open-link @category:happy-path @quality:functional @severity:critical
  Scenario: The doctor opens the link on their own device
    When Alice shares her brief with "Dr. Lane" (Primary care, "lane@clinic.example") for 7 days
    Then the doctor's link shows Alice's brief without signing in

  @security @audience:patient @usecase:share-stop-one @category:security @quality:privacy @severity:critical
  Scenario: Stopping one person leaves the others working
    Given Alice shares her brief with "Dr. Lane" (Primary care, "lane@clinic.example") for 7 days
    And Alice shares her brief with "Sam Ortiz" (Therapist, "sam@therapy.example") for 7 days
    When Alice stops sharing with "Dr. Lane"
    Then the link for "Dr. Lane" says the patient stopped sharing
    And the link for "Sam Ortiz" still shows the brief

  @security @audience:patient @usecase:share-delete-account @category:security @quality:privacy @severity:critical
  Scenario: Deleting the account stops every share
    Given Alice shares her brief with "Dr. Lane" (Primary care, "lane@clinic.example") for 7 days
    And Alice shares her brief with "Sam Ortiz" (Therapist, "sam@therapy.example") for 7 days
    When Alice deletes her account
    Then no link opens anymore

  @security @audience:another-patient @usecase:share-isolation @category:security @quality:privacy @severity:critical
  Scenario: Another patient can't see or stop Alice's links
    Given Alice shares her brief with "Dr. Lane" (Primary care, "lane@clinic.example") for 7 days
    When Bob tries to stop Alice's link
    Then Bob is told the link isn't in his account
    And the link for "Dr. Lane" still shows the brief

  @security @safety @audience:patient @usecase:share-crisis @category:security @quality:safety @severity:critical
  Scenario: A brief with crisis language is not shared
    When Alice tries to share a brief that says "I want to hurt myself"
    Then she is shown crisis support and nothing is shared

  @security @audience:clinician @usecase:share-guess-link @category:negative @quality:privacy @severity:high
  Scenario: A guessed link opens nothing
    When someone opens a link that was never shared
    Then they are told the link can't be found
