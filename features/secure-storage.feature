# Feature index entry: secure storage for the Visit store (board cards "Secure storage" and "Simple visit store (the
# compounding record)", ADR-018). The person's record is encrypted by the API server before it reaches the database.
# Audience: a signed-in patient who turned on backup and sync; the shared demo account (Theo); anyone not signed in.
# Scenarios drive the real Express app with an in-memory store and a random test key.

@feature:secure-storage
Feature: My record is stored encrypted, for me only
  So that my health history survives a new phone or a cleared browser without anyone else reading it
  As a patient who turned on backup
  I want my record saved encrypted on the server, readable only by me through the app

  @audience:patient @usecase:ss-save-load @category:happy-path @quality:functional @severity:high
  Scenario: Saving and loading my record
    Given Sam is signed in and server backup is set up
    When Sam saves a record with the note "Dizzy when I stand up"
    Then Sam gets the record back with the note "Dizzy when I stand up"

  @security @audience:patient @usecase:ss-encrypted-at-rest @category:security @quality:privacy @severity:critical
  Scenario: The database never holds readable health details
    Given Sam is signed in and server backup is set up
    When Sam saves a record with the note "Dizzy when I stand up"
    Then the stored row does not contain "Dizzy"

  @security @audience:patient @usecase:ss-owner-only @category:permission-denied @quality:privacy @severity:critical
  Scenario: Another person can't get my record
    Given Sam is signed in and server backup is set up
    When Sam saves a record with the note "Dizzy when I stand up"
    Then Riley gets no record

  @security @audience:patient @usecase:ss-no-secrets @category:security @quality:privacy @severity:high
  Scenario: The password hash and share-link tokens are never stored
    Given Sam is signed in and server backup is set up
    When Sam saves a record that includes a password hash and a share link
    Then the record Sam gets back has no password hash and no share links

  @audience:patient @usecase:ss-two-devices @category:concurrency @quality:reliability @severity:high
  Scenario: An out-of-date device can't overwrite newer changes
    Given Sam is signed in and server backup is set up
    And Sam has saved twice from the phone
    When Sam's laptop saves based on the first version
    Then the save is refused as a conflict with the newer record

  @security @audience:demo @usecase:ss-demo-read-only @category:permission-denied @quality:safety @severity:high
  Scenario: The shared demo account can't save a record
    Given Theo is signed in and server backup is set up
    When Theo saves a record with the note "anything"
    Then the answer is "DEMO_ACCOUNT_READ_ONLY"

  @security @audience:operator @usecase:ss-fail-closed @category:error @quality:safety @severity:critical
  Scenario: Without an encryption key nothing is stored
    Given Sam is signed in but no encryption key is set
    When Sam saves a record with the note "Dizzy when I stand up"
    Then the answer is "RECORD_STORE_NOT_CONFIGURED"
