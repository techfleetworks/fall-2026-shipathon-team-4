# Feature index entry: the Visit store, a record that compounds across visits and devices (board card "Simple visit store
# (the compounding record)", ADR-019). Opt-in backup and sync on top of the encrypted storage (ADR-018).
# Audience: a signed-in patient on more than one device; a patient who never turns backup on; two people sharing a device.
# Scenarios run the real sync engine against the real encrypted record service (in memory).

@feature:visit-store
Feature: My record builds up across visits and devices, only if I turn backup on
  So that my history keeps growing visit after visit and is there on any device I log in on
  As a patient
  I want to choose to back up and sync my record, and still use the app offline

  @security @audience:patient @usecase:vs-opt-in @category:security @quality:privacy @severity:critical
  Scenario: Nothing leaves my device until I turn backup on
    Given Sam uses the app on a phone
    When Sam adds the note "Dizzy when I stand up"
    Then nothing is saved on the server for Sam

  @audience:patient @usecase:vs-compounding @category:happy-path @quality:functional @severity:high
  Scenario: Notes from my phone and my laptop end up in one record
    Given Sam uses the app on a phone and a laptop with backup on
    When Sam adds the note "phone note" on the phone and "laptop note" on the laptop
    And both devices sync
    Then both devices have "phone note" and "laptop note"

  @audience:patient @usecase:vs-delete-sticks @category:edge @quality:functional @severity:high
  Scenario: Something I delete on one device doesn't come back from the other
    Given Sam uses the app on a phone and a laptop with backup on, both with the note "old note"
    When Sam deletes "old note" on the laptop
    And both devices sync
    Then neither device has "old note"

  @audience:patient @usecase:vs-offline @category:error @quality:reliability @severity:high
  Scenario: Offline, my changes stay on this device and back up later
    Given Sam uses the app on a phone and a laptop with backup on
    And the phone is offline
    When Sam adds the note "written on the train" on the phone
    Then the phone says it is offline and still has "written on the train"
    When the phone is back online and syncs
    Then the server has "written on the train"

  @audience:patient @usecase:vs-restore @category:happy-path @quality:functional @severity:high
  Scenario: Logging in on a new phone brings my record back
    Given Sam uses the app on a phone and a laptop with backup on
    And Sam adds the note "from the old phone" on the phone and syncs
    When Sam logs in on a new phone
    Then the new phone has "from the old phone"

  @security @audience:shared-device @usecase:vs-other-account @category:permission-denied @quality:privacy @severity:critical
  Scenario: Someone else logging in on my device never gets or sends my record
    Given Sam uses the app on a phone and a laptop with backup on
    When Riley logs in on Sam's phone
    Then the phone's sync is paused for Riley and Riley has nothing on the server
