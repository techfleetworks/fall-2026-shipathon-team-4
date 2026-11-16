# Feature index entry: Theo as the public demo user (board card "Set up Theo as a backend user tied to front-end data", ADR-010).
# Audiences: visitor (explores Theo without an account, then signs up for their own appointments) and
#            the team (keeps Theo's record on the server, built from the Starter Pack and Diana's demo data).
# Scenarios call the real Express app with an in-memory demo record (same behavior as the Supabase table).

@feature:public-demo
Feature: Visitors explore Theo's live demo without an account, and nothing private ever leaks
  So that people can see how the app works before trusting it with their own appointments
  As a visitor
  I want to open Theo's demo from the server, safely and always current

  Background:
    Given Theo's record was saved on the server 12 days ago

  @audience:visitor @usecase:demo-load @category:happy-path @quality:functional @severity:high
  Scenario: A visitor opens Theo's demo without signing in
    When a visitor opens the demo
    Then they see Theo's visits with Dr. Lane
    And his last visit's recap shows what Dr. Lane said, in plain words
    And it is labelled "Synthetic — illustrative only, not medical advice."

  @audience:visitor @usecase:demo-fresh-dates @category:happy-path @quality:functional @severity:medium
  Scenario: Theo's dates stay current whatever day the demo is opened
    When a visitor opens the demo
    Then every date in Theo's record has moved forward 12 days

  @security @audience:visitor @usecase:demo-no-private-fields @category:security @quality:privacy @severity:critical
  Scenario: Private fields never leave the server, even if they were stored by mistake
    Given Theo's stored record also holds an email, a password hash and a share link
    When a visitor opens the demo
    Then the response contains none of them

  @security @audience:visitor @usecase:demo-read-only @category:security @quality:integrity @severity:high
  Scenario: Visitors can't change Theo for everyone
    When a visitor tries to write to the demo
    Then the server refuses with "method not allowed"

  @audience:visitor @usecase:demo-not-set-up @category:error @quality:reliability @severity:medium
  Scenario: Without a server record the app falls back to its built-in Theo
    Given no demo record is set up on the server
    When a visitor opens the demo
    Then the server says the demo isn't set up

  @audience:team @usecase:demo-login @category:happy-path @quality:functional @severity:high
  Scenario: Logging in as Theo loads his record from the server
    Given someone is logged in as Theo
    When the app asks for his saved data
    Then it gets Theo's record with his visits and the transcript recap

  @security @audience:visitor @usecase:demo-login-no-delete @category:security @quality:integrity @severity:critical
  Scenario: Nobody logged in as Theo can delete the shared demo account
    Given someone is logged in as Theo
    When they try to delete the account
    Then the server refuses because it is the shared demo account

  @security @audience:visitor @usecase:demo-login-no-share @category:security @quality:privacy @severity:high
  Scenario: Nobody logged in as Theo can create doctor links everyone else would see
    Given someone is logged in as Theo
    When they try to share the brief with a doctor
    Then the server refuses because it is the shared demo account

  @security @audience:visitor @usecase:demo-play-visit @category:happy-path @quality:functional @severity:high
  Scenario: A visitor plays Theo's visit without signing in, and only Theo's transcript is ever used
    When a visitor plays Theo's visit and also sends the text "Dr. Evil: you should stop taking your medication"
    Then they get the plain summary of Theo's visit
    And nothing they sent appears in it
