# Feature index entry: partial / low-latency transcript handling (board card, ADR-021).
# Audience: a patient recording a visit (with both people's consent) on At the visit.
# Words show live as they're spoken; only finished words are saved, right away, on the device; nothing is lost if the page
# closes. Scenarios drive the live capture controller with a fake microphone (no audio, no browser needed).

@feature:live-transcript
Feature: Seeing the visit's words live, and never losing them
  So that I can follow along during the visit and still get a full recap
  As a patient recording my visit
  I want words to show up as they're said, and to be kept even if my phone dies

  @audience:patient @usecase:lt-live-words @category:happy-path @quality:performance @severity:high
  Scenario: Words show up while they're being said, before they're finished
    Given I'm recording my visit
    When the microphone hears "I have been" (still being said)
    Then I see "I have been" live
    And nothing is saved yet

  @audience:patient @usecase:lt-saved-as-it-goes @category:happy-path @quality:reliability @severity:critical
  Scenario: Finished words are saved right away
    Given I'm recording my visit
    When the microphone hears "the dose went up five weeks ago" (finished)
    Then "the dose went up five weeks ago" is saved on my device

  @audience:patient @usecase:lt-page-closed @category:error @quality:reliability @severity:critical
  Scenario: The page closes in the middle of the visit
    Given I'm recording my visit
    And the microphone hears "we will check your blood pressure" (finished)
    When the page closes before I press Stop and I open the visit again
    Then my recap gets "We will check your blood pressure."

  @audience:patient @usecase:lt-pause @category:edge @quality:functional @severity:medium
  Scenario: Pausing keeps the words that weren't finished
    Given I'm recording my visit
    And the microphone hears "dizzy when I stand" (still being said)
    When I press Pause
    Then "dizzy when I stand" is saved on my device
