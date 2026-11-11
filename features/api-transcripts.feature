# Feature index entry: Get Heard API, POST /api/transcripts and GET /api/health.
# Audiences: api-consumer (the Get Heard web app, later the after-visit summary service)
#            and anonymous-attacker (anyone sending requests straight to the public API).
# Scenarios send real HTTP requests to the Express app in-process (supertest), not to a deployed URL.

@feature:api-transcripts
Feature: Transcript intake API
  So that transcripts are checked the same way no matter which client sends them
  As the Get Heard app
  I want a server endpoint that validates a visit transcript and returns a labelled payload

  @audience:api-consumer @usecase:api-health @category:happy @quality:reliability @severity:high
  Scenario: The health check reports the API is up
    When I GET "/api/health"
    Then the response status is 200
    And the response field "status" is "ok"

  @audience:api-consumer @usecase:api-sample-transcript @category:happy @quality:functional @severity:critical
  Scenario: Theo's sample transcript is accepted with the synthetic label
    When I POST Theo's sample transcript to "/api/transcripts"
    Then the response status is 201
    And the response field "status" is "accepted"
    And the payload label is exactly "Synthetic — illustrative only, not medical advice."

  @audience:api-consumer @usecase:api-empty @category:negative @quality:functional @severity:high
  Scenario: An empty transcript is rejected
    When I POST the JSON '{"transcript": "   "}' to "/api/transcripts"
    Then the response status is 400
    And the error code is "EMPTY"

  @security @safety @audience:anonymous-attacker @usecase:api-crisis-fixture @category:security @quality:safety @severity:critical
  Scenario: The safety fixture returns help and no payload
    When I POST the transcript "Theo: I don't see the point anymore" to "/api/transcripts"
    Then the response status is 200
    And the response field "status" is "crisis"
    And the response has no payload

  @security @owasp:input-validation @audience:anonymous-attacker @usecase:api-not-json @category:security @quality:security @severity:high
  Scenario: A non-JSON body is refused
    When I POST the text "Theo: hi" to "/api/transcripts"
    Then the response status is 415

  @security @owasp:error-handling @audience:anonymous-attacker @usecase:api-malformed-json @category:security @quality:privacy @severity:high
  Scenario: Malformed JSON is rejected without echoing the body
    When I POST the raw JSON '{"transcript": "PATIENT-SECRET' to "/api/transcripts"
    Then the response status is 400
    And the error code is "MALFORMED_JSON"
    And the response does not contain "PATIENT-SECRET"

  @security @owasp:denial-of-service @audience:anonymous-attacker @usecase:api-oversized @category:security @quality:security @severity:high
  Scenario: A body over 1 MB is refused
    When I POST a transcript of 1100000 characters to "/api/transcripts"
    Then the response status is 413

  @security @owasp:http-headers @audience:anonymous-attacker @usecase:api-headers @category:security @quality:security @severity:medium
  Scenario: Responses carry the security headers and are never cached
    When I GET "/api/health"
    Then the header "x-content-type-options" is "nosniff"
    And the header "cache-control" is "no-store"
    And there is no "x-powered-by" header
