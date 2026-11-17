# Feature index entry: forgot password / reset (ADR-023). Audience: a real user who can't remember their password.
# Before this, "Forgot your password?" only said reset wasn't available and to make a new account (impossible with the
# same email on the server). Scenarios call the auth functions with a fake Supabase client.

@feature:password-reset
Feature: Getting back into my account when I forget my password
  So that I don't lose my account and my record
  As a patient with an account
  I want to get a link by email and choose a new password

  @audience:patient @usecase:pr-send-link @category:happy-path @quality:functional @severity:high
  Scenario: Asking for a reset link
    When I ask for a reset link for "sam@example.com"
    Then Supabase is asked to email a link that opens "/reset-password"
    And I'm told to check my email

  @security @audience:anyone @usecase:pr-no-enumeration @category:security @quality:privacy @severity:high
  Scenario: Nobody can find out who has an account
    When someone asks for a reset link for an email with no account
    Then they see the same message as for a real account

  @audience:patient @usecase:pr-new-password @category:happy-path @quality:functional @severity:high
  Scenario: Choosing a new password from the link
    Given I opened a valid reset link
    When I save the new password "longenough1" twice
    Then the new password is saved and I'm sent to log in

  @security @audience:anyone @usecase:pr-expired @category:security @quality:safety @severity:high
  Scenario: An old or used link can't change the password
    Given the reset link has expired
    When I save the new password "longenough1" twice
    Then nothing is saved and I'm told to get a new link
