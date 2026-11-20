# Feature index entry: Name how I feel never blocks on a missing or expired sign-in (ADR-024).
# Audience: a demo visitor exploring Theo's data, and a patient whose sign-in expired.
# Before: the server answered 401 and Continue showed "Your sign-in has expired" and never moved on.
# Scenarios call requestStorySummary with a server that answers 401.

@feature:story-without-signin
Feature: Writing my story even when I'm not signed in to the server
  So that I never get stuck halfway through getting ready for a visit
  As a patient or a demo visitor
  I want my words turned into doctor terms on this device when the server won't accept me

  @audience:demo @usecase:sws-demo-visitor @category:error @quality:reliability @severity:critical
  Scenario: A demo visitor without a sign-in can continue
    Given the server answers "please log in" and there is no sign-in on this device
    When I describe how I feel as "I'm always tired and I can't sleep"
    Then my words are turned into doctor terms on this device
    And nothing tells me my sign-in expired

  @audience:patient @usecase:sws-expired @category:error @quality:reliability @severity:high
  Scenario: My sign-in expired
    Given the server answers "please log in" and this device had a sign-in
    When I describe how I feel as "I'm always tired and I can't sleep"
    Then my words are turned into doctor terms on this device
    And I'm told to log in again, without being blocked

  @security @audience:patient @usecase:sws-crisis @category:adverse @quality:safety @severity:critical
  Scenario: Crisis words still go to crisis support
    Given the server answers "please log in" and there is no sign-in on this device
    When I describe how I feel as "I want to hurt myself"
    Then I'm sent to crisis support
