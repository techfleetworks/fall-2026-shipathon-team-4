# Feature index entry: real-time "be-believed" cues during the visit (board card "Real-time prompts / checklist during the
# visit ('be-believed' cues)", ADR-022). Audience: a patient at the visit, with the live transcript (ADR-021) or quick notes.
# A cue = what was heard + the matching reviewed playbook line (src/data/scripts.ts), blanks filled from the record.
# Scenarios call detectCues directly.

@feature:be-believed-cues
Feature: A nudge with the right words when I'm being brushed off
  So that I can speak up in the moment, not only afterwards
  As a patient at my visit
  I want the app to notice a dismissing moment and show me a calm, prepared line to say

  @audience:patient @usecase:bb-depression @category:happy-path @quality:functional @severity:high
  Scenario: "It's probably the depression"
    Given my talking points and my medication change on "2026-10-11"
    When I hear "It's probably the depression"
    Then a cue says I could say "It started right after the medication change on Oct 11"

  @audience:patient @usecase:bb-time @category:happy-path @quality:functional @severity:medium
  Scenario: "Let's give it more time"
    Given my talking points and my medication change on "2026-10-11"
    When I hear "Let's give it more time"
    Then a cue says I could say "What should I watch for"

  @audience:patient @usecase:bb-no-false-alarm @category:edge @quality:functional @severity:high
  Scenario: Ordinary talk doesn't set off a cue
    Given my talking points and my medication change on "2026-10-11"
    When I hear "How is your depression treatment going?"
    Then there is no cue

  @audience:patient @usecase:bb-covered @category:happy-path @quality:functional @severity:medium
  Scenario: A talking point comes up in other words
    Given my talking points and my medication change on "2026-10-11"
    When I hear "so you get lightheaded when you stand up?"
    Then the app suggests ticking "Dizzy and lightheaded when standing up"

  @security @audience:patient @usecase:bb-crisis @category:adverse @quality:safety @severity:critical
  Scenario: No cues when crisis words are heard
    Given my talking points and my medication change on "2026-10-11"
    When I hear "It's probably the depression" and "I want to hurt myself"
    Then there is no cue
