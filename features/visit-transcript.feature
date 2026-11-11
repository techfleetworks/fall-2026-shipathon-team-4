# Feature index entry: visit transcript intake ("In the room" step, PRD F5/F8 input).
# Audiences: patient (Theo in the demo; a person using Get Heard after a visit)
#            and anonymous-attacker (crafted text or files fed to the intake).
# These scenarios exercise processTranscript / decodeTranscriptFile, the same functions the screen calls.
# Screen behavior (focus, screen reader announcements, navigation to /help/now) is not covered here.

@feature:visit-transcript
Feature: Add what was said in the room to a visit
  So that Get Heard can build an after-visit summary and my case
  As a patient after a visit
  I want to paste or upload the conversation and get back a structured, clearly labelled transcript

  @audience:patient @usecase:sample-transcript @category:happy @quality:functional @severity:critical
  Scenario: Theo's sample transcript is accepted with speakers and the synthetic label
    Given Theo's sample transcript
    When the transcript is processed
    Then it is accepted with source "sample"
    And the speakers are "Theo, Dr. Lane"
    And it has 7 lines of conversation
    And the payload has a UUID id and an ISO 8601 receivedAt timestamp
    And the label is exactly "Synthetic — illustrative only, not medical advice."

  @audience:patient @usecase:paste-happy-path @category:happy @quality:functional @severity:critical
  Scenario: A pasted conversation is cleaned and accepted
    Given the pasted text "Theo: I get dizzy when I stand.\r\nDr. Lane: Let's give it time.\r\nTheo: It started with the new dose."
    When the transcript is processed
    Then it is accepted with source "paste"
    And the transcript is "Theo: I get dizzy when I stand.\nDr. Lane: Let's give it time.\nTheo: It started with the new dose."

  @audience:patient @usecase:upload-happy-path @category:happy @quality:functional @severity:critical
  Scenario: An uploaded .txt file is decoded and accepted
    Given an uploaded file "visit.txt" containing "Theo: I'm falling asleep at my desk.\nDr. Lane: Push through.\nTheo: For a month?"
    When the transcript is processed
    Then it is accepted with source "upload"

  @audience:patient @usecase:empty-input @category:negative @quality:functional @severity:high
  Scenario Outline: Empty or whitespace-only input is rejected
    Given the pasted text "<text>"
    When the transcript is processed
    Then it is rejected with code "EMPTY"

    Examples:
      | text   |
      |        |
      | \s\s\s |
      | \n\t\n |

  @audience:patient @usecase:too-long @category:boundary @quality:reliability @severity:high
  Scenario: Text at the limit is accepted and one character over is rejected
    Given a transcript of exactly 200000 characters
    When the transcript is processed
    Then it is accepted with source "paste"
    Given a transcript of exactly 200001 characters
    When the transcript is processed
    Then it is rejected with code "TOO_LONG"

  @security @safety @audience:patient @usecase:crisis-fixture @category:security @quality:safety @severity:critical
  Scenario: The Starter Pack safety fixture goes to the crisis path and nothing is built
    Given the pasted text "Dr. Lane: How have things been?\nTheo: I don't see the point anymore"
    When the transcript is processed
    Then it is routed to the crisis path
    And no payload is built

  @security @safety @audience:anonymous-attacker @usecase:crisis-evasion @category:security @quality:safety @severity:high
  Scenario: Crisis language split by a control character is still caught
    Given the pasted text "Theo: I want to d\u0000ie"
    When the transcript is processed
    Then it is routed to the crisis path

  @security @owasp:file-upload @audience:anonymous-attacker @usecase:upload-wrong-type @category:security @quality:security @severity:high
  Scenario: A non-.txt upload is rejected by the extension allow-list
    Given an uploaded file "payload.html" containing "<script>alert(1)</script>"
    When the transcript is processed
    Then it is rejected with code "FILE_TYPE"

  @security @owasp:file-upload @audience:anonymous-attacker @usecase:upload-binary-disguised @category:security @quality:security @severity:high
  Scenario: A binary file renamed to .txt is rejected by the content check
    Given an uploaded file "image.txt" with binary bytes
    When the transcript is processed
    Then it is rejected with code "FILE_NOT_TEXT"

  @security @owasp:denial-of-service @audience:anonymous-attacker @usecase:upload-oversized @category:security @quality:security @severity:high
  Scenario: An oversized upload is rejected
    Given an uploaded file "huge.txt" of 600000 bytes
    When the transcript is processed
    Then it is rejected with code "FILE_TOO_LARGE"

  @security @owasp:error-handling @audience:anonymous-attacker @usecase:error-no-leak @category:security @quality:privacy @severity:high
  Scenario: Error messages never echo transcript content
    Given a transcript of exactly 200001 characters containing the marker "PATIENT-SECRET"
    When the transcript is processed
    Then it is rejected with code "TOO_LONG"
    And the error message does not contain "PATIENT-SECRET"

  @security @owasp:input-validation @audience:anonymous-attacker @usecase:control-characters @category:security @quality:security @severity:medium
  Scenario: Control characters are stripped
    Given the pasted text "Theo:\u0000 I feel off\u001b[31m"
    When the transcript is processed
    Then it is accepted with source "paste"
    And the transcript is "Theo: I feel off[31m"
