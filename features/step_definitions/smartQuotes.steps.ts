import assert from 'node:assert/strict';
import { Then, When } from '@cucumber/cucumber';
import { hasCrisisLanguage } from '../../src/lib/safety.js';
import { matchSymptoms } from '../../src/lib/translate.js';

interface World { sqText?: string }

When('I type {string} with a phone apostrophe', function (this: World, text: string) {
  assert.ok(text.includes('’'), 'the scenario must use a phone (curly) apostrophe');
  this.sqText = text;
});
Then('the crisis check catches it', function (this: World) { assert.equal(hasCrisisLanguage(this.sqText), true); });
Then('my doctor reads {string}', function (this: World, term: string) { assert.ok(matchSymptoms(this.sqText!).includes(term)); });
