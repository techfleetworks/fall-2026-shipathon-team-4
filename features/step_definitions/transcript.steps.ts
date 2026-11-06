import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { submitTranscript } from "../../app/actions/transcript";
import { FIELD_FILE, FIELD_TEXT } from "../../lib/transcript/constants";
import { INITIAL_TRANSCRIPT_STATE, type TranscriptActionState } from "../../lib/transcript/types";

interface World {
  form: FormData;
  state?: TranscriptActionState;
}

/** Turn Gherkin escape sequences (\n, \r, \t, \s, \uXXXX) into real characters. */
function unescape(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\s/g, " ");
}

function formOf(world: World): FormData {
  world.form ??= new FormData();
  return world.form;
}

Given("the transcript text {string}", function (this: World, text: string) {
  formOf(this).set(FIELD_TEXT, unescape(text));
});

Given("a transcript of exactly {int} characters", function (this: World, n: number) {
  this.form = new FormData();
  this.form.set(FIELD_TEXT, "a".repeat(n));
});

Given(
  "a transcript of exactly {int} characters containing the marker {string}",
  function (this: World, n: number, marker: string) {
    this.form = new FormData();
    this.form.set(FIELD_TEXT, (marker + " ").repeat(Math.ceil(n / (marker.length + 1))).slice(0, n));
  },
);

Given("an uploaded file {string} containing {string}", function (this: World, name: string, content: string) {
  formOf(this).set(FIELD_FILE, new File([content], name, { type: "text/plain" }));
});

Given("an uploaded file {string} with binary bytes", function (this: World, name: string) {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00]);
  formOf(this).set(FIELD_FILE, new File([bytes], name, { type: "text/plain" }));
});

Given("an uploaded file {string} of {int} bytes", function (this: World, name: string, size: number) {
  formOf(this).set(FIELD_FILE, new File([new Uint8Array(size).fill(97)], name, { type: "text/plain" }));
});

Given("a direct request with a file placed in the text field", function (this: World) {
  formOf(this).set(FIELD_TEXT, new File(["x"], "x.txt"));
});

When("the transcript is submitted", async function (this: World) {
  this.state = await submitTranscript(INITIAL_TRANSCRIPT_STATE, formOf(this));
});

function success(world: World) {
  assert.equal(world.state?.status, "success", `expected success, got ${JSON.stringify(world.state)}`);
  return (world.state as Extract<TranscriptActionState, { status: "success" }>).payload;
}

Then("the submission succeeds with source {string}", function (this: World, source: string) {
  assert.equal(success(this).source, source);
});

Then("the payload transcript is {string}", function (this: World, expected: string) {
  assert.equal(success(this).transcript, unescape(expected));
});

Then("the payload has a UUID id and an ISO 8601 receivedAt timestamp", function (this: World) {
  const p = success(this);
  assert.match(p.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Date(p.receivedAt).toISOString(), p.receivedAt);
});

Then("the payload disclaimer is exactly {string}", function (this: World, expected: string) {
  assert.equal(success(this).disclaimer, expected);
});

Then("the submission fails with code {string}", function (this: World, code: string) {
  assert.equal(this.state?.status, "error", `expected error, got ${this.state?.status}`);
  if (this.state?.status === "error") assert.equal(this.state.error.code, code);
});

Then("the error message does not contain {string}", function (this: World, marker: string) {
  if (this.state?.status !== "error") assert.fail("expected an error state");
  assert.ok(!this.state.error.message.includes(marker));
});
