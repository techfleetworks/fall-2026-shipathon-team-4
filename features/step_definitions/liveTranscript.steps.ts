import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { createLiveCapture, type RecognizerLike } from '../../src/lib/transcript/liveCapture.js';

class FakeMic implements RecognizerLike {
  static last: FakeMic;
  lang = ''; interimResults = false; continuous = false;
  onresult: RecognizerLike['onresult'] = null; onend: RecognizerLike['onend'] = null; onerror: RecognizerLike['onerror'] = null;
  constructor() { FakeMic.last = this; }
  start() {}
  stop() {}
  hear(text: string, isFinal: boolean) { this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal })] }); }
}

interface World {
  ltCap?: ReturnType<typeof createLiveCapture>;
  ltSaved: string[];
  ltLive: string;
  ltPause?: () => void;
  ltRecap?: string[];
}

function begin(w: World, initial: string[] = []) {
  w.ltSaved = [...initial];
  w.ltLive = '';
  w.ltCap = createLiveCapture({ Recognizer: FakeMic, initial, onState: (s) => { w.ltLive = s.interim; }, onSave: (s) => { w.ltSaved = s; } });
  w.ltPause = w.ltCap.listen();
}

Given("I'm recording my visit", function (this: World) { begin(this); });

const hear = (text: string, kind: string) => FakeMic.last.hear(text, kind === 'finished');
When('the microphone hears {string} \\(still being said)', function (this: World, t: string) { hear(t, 'live'); });
When('the microphone hears {string} \\(finished)', function (this: World, t: string) { hear(t, 'finished'); });

When('I press Pause', function (this: World) { this.ltPause!(); });
When('the page closes before I press Stop and I open the visit again', function (this: World) {
  // A new screen starts from what was saved on the device; the old one is simply gone.
  const savedOnDevice = this.ltSaved;
  const reopened = createLiveCapture({ Recognizer: FakeMic, initial: savedOnDevice, onState: () => {}, onSave: () => {} });
  this.ltRecap = reopened.take();
});

Then('I see {string} live', function (this: World, t: string) { assert.equal(this.ltLive, t); });
Then('nothing is saved yet', function (this: World) { assert.deepEqual(this.ltSaved, []); });
Then('{string} is saved on my device', function (this: World, t: string) { assert.ok(this.ltSaved.includes(t), JSON.stringify(this.ltSaved)); });
Then('my recap gets {string}', function (this: World, s: string) { assert.ok(this.ltRecap!.includes(s), JSON.stringify(this.ltRecap)); });
