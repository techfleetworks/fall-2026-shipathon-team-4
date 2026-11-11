# Feature index entry: guardrails & disclaimers (ticket B1).
# Audiences: patient (anyone reading engine output) and the engine itself (rule-based today, Claude later),
#            treated as an untrusted producer whose output is checked before the patient sees it.
# Scenarios call guardResponse / checkOutput directly. Placement of disclaimer lines in screens is not covered.

@feature:guardrails
Feature: The engine never diagnoses, advises or doses, and crisis comes first
  So that patients are prepared and believed without the app practicing medicine
  As a patient using the app
  I want every engine response checked against the behavior rules before I see it

  @security @safety @audience:patient @usecase:guard-crisis-input @category:security @quality:safety @severity:critical
  Scenario: Crisis language in the patient's words takes priority over any output
    Given the patient wrote "I don't see the point anymore"
    When the engine answers "Here is your summary."
    Then the response goes to the crisis path

  @security @safety @audience:patient @usecase:guard-crisis-sentinel @category:security @quality:safety @severity:critical
  Scenario: The engine's own crisis signal goes to the crisis path
    Given the patient wrote "Theo: I feel off lately"
    When the engine answers "[[CRISIS]]"
    Then the response goes to the crisis path

  @security @audience:patient @usecase:guard-diagnosis @category:security @quality:safety @severity:critical
  Scenario: A diagnosis is blocked and replaced with an honest fallback
    Given the patient wrote "I'm tired all the time and my joints hurt"
    When the engine answers "You probably have lupus."
    Then the response is blocked for "no-diagnosis"
    And the patient sees the honest fallback

  @security @audience:patient @usecase:guard-advice @category:security @quality:safety @severity:critical
  Scenario: Treatment advice is blocked
    Given the patient wrote "Since the ziprasidone dose went up I'm drowsy all day"
    When the engine answers "You should stop taking the ziprasidone."
    Then the response is blocked for "no-medical-advice"

  @security @audience:patient @usecase:guard-dosing @category:security @quality:safety @severity:critical
  Scenario: A dose the patient didn't report is blocked
    Given the patient wrote "I take ziprasidone and feel dizzy"
    When the engine answers "Ziprasidone works best at 20 mg twice a day."
    Then the response is blocked for "no-dosing"

  @audience:patient @usecase:guard-questions-allowed @category:happy @quality:functional @severity:high
  Scenario: Questions to ask the clinician are allowed
    Given the patient wrote "Since the ziprasidone dose went up I'm drowsy and dizzy when I stand"
    When the engine answers "Could the ziprasidone be causing the sedation and the lightheadedness?"
    Then the response is shown unchanged

  @audience:patient @usecase:guard-echo-allowed @category:happy @quality:functional @severity:high
  Scenario: Echoing the patient's own medication and dose is allowed
    Given the patient wrote "Medication: ziprasidone 40 mg, started 5 weeks ago"
    When the engine answers "Ziprasidone 40 mg, started 5 weeks ago. Drowsiness began after the dose change."
    Then the response is shown unchanged

  @security @safety @audience:patient @usecase:guard-crisis-story-skip @category:security @quality:safety @severity:critical
  Scenario: Crisis language typed into any story step never reaches a summary or brief
    Given the patient typed "I want to hurt myself" into the "triggers" step of their story
    When the story is about to become a summary
    Then the story goes to the crisis path instead

  @security @safety @audience:patient @usecase:guard-crisis-handoff @category:security @quality:safety @severity:critical
  Scenario: The crisis handoff surfaces 988 first, gently
    When crisis support is shown after crisis language
    Then 988 is the first resource
    And nothing in it mentions police or rescue
