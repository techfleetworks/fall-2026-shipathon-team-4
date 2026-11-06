# Feature index entry: transcript intake (Server Action submitTranscript).
# Audiences: anonymous-user (patient, caregiver, or advocate using the prototype; no accounts yet)
#            and anonymous-attacker (direct POST to the Server Action, bypassing the page).
# These scenarios call the Server Action directly, so they prove server-side behavior only.
# Browser/UI behavior (focus, screen reader announcements) is not covered here.

@feature:transcript-intake
Feature: Accept a pasted or uploaded transcript
  So that later features can analyze a visit transcript
  As a patient advocate using the prototype
  I want to submit a transcript and get back a structured, clearly labelled payload

  @audience:anonymous-user @usecase:paste-happy-path @category:happy @quality:functional @severity:critical
  Scenario: Pasted transcript is accepted with metadata and the safety disclaimer
    Given the transcript text "Doctor: How are you feeling?\r\nPatient: Tired."
    When the transcript is submitted
    Then the submission succeeds with source "paste"
    And the payload transcript is "Doctor: How are you feeling?\nPatient: Tired."
    And the payload has a UUID id and an ISO 8601 receivedAt timestamp
    And the payload disclaimer is exactly "Synthetic - illustrative only, not medical advice"

  @audience:anonymous-user @usecase:upload-happy-path @category:happy @quality:functional @severity:critical
  Scenario: Uploaded .txt transcript is accepted
    Given an uploaded file "visit.txt" containing "Patient: My chest hurts."
    When the transcript is submitted
    Then the submission succeeds with source "upload"
    And the payload disclaimer is exactly "Synthetic - illustrative only, not medical advice"

  @audience:anonymous-user @usecase:empty-input @category:negative @quality:functional @severity:high
  Scenario Outline: Empty or whitespace-only transcript is rejected
    Given the transcript text "<text>"
    When the transcript is submitted
    Then the submission fails with code "EMPTY"

    Examples:
      | text      |
      |           |
      | \s\s\s    |
      | \n\t\n    |

  @audience:anonymous-user @usecase:too-long @category:boundary @quality:reliability @severity:high
  Scenario: Transcript at the limit is accepted and one character over is rejected
    Given a transcript of exactly 200000 characters
    When the transcript is submitted
    Then the submission succeeds with source "paste"
    Given a transcript of exactly 200001 characters
    When the transcript is submitted
    Then the submission fails with code "TOO_LONG"

  @audience:anonymous-user @usecase:both-provided @category:negative @quality:usability @severity:medium
  Scenario: Pasting text and uploading a file at the same time is rejected with guidance
    Given the transcript text "Doctor: Hello"
    And an uploaded file "visit.txt" containing "Patient: Hi"
    When the transcript is submitted
    Then the submission fails with code "BOTH_PROVIDED"

  @security @owasp:file-upload @audience:anonymous-attacker @usecase:upload-wrong-type @category:security @quality:security @severity:high
  Scenario: Non-.txt upload is rejected by extension allow-list
    Given an uploaded file "payload.html" containing "<script>alert(1)</script>"
    When the transcript is submitted
    Then the submission fails with code "FILE_TYPE"

  @security @owasp:file-upload @audience:anonymous-attacker @usecase:upload-binary-disguised @category:security @quality:security @severity:high
  Scenario: Binary file renamed to .txt is rejected by content check
    Given an uploaded file "image.txt" with binary bytes
    When the transcript is submitted
    Then the submission fails with code "FILE_NOT_TEXT"

  @security @owasp:denial-of-service @audience:anonymous-attacker @usecase:upload-oversized @category:security @quality:security @severity:high
  Scenario: Oversized upload is rejected before it is read
    Given an uploaded file "huge.txt" of 600000 bytes
    When the transcript is submitted
    Then the submission fails with code "FILE_TOO_LARGE"

  @security @owasp:nextjs @audience:anonymous-attacker @usecase:server-action-direct-call @category:security @quality:security @severity:critical
  Scenario: A direct call with a malformed field is rejected by server-side validation
    Given a direct request with a file placed in the text field
    When the transcript is submitted
    Then the submission fails with code "INVALID_INPUT"

  @security @owasp:error-handling @audience:anonymous-attacker @usecase:error-no-leak @category:security @quality:privacy @severity:high
  Scenario: Error messages never echo transcript content
    Given a transcript of exactly 200001 characters containing the marker "PATIENT-SECRET"
    When the transcript is submitted
    Then the submission fails with code "TOO_LONG"
    And the error message does not contain "PATIENT-SECRET"

  @security @owasp:input-validation @audience:anonymous-attacker @usecase:control-characters @category:security @quality:security @severity:medium
  Scenario: Control characters are stripped from the transcript
    Given the transcript text "Doctor:\u0000 Hi\u001b[31m"
    When the transcript is submitted
    Then the submission succeeds with source "paste"
    And the payload transcript is "Doctor: Hi[31m"
