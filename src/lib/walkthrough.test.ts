import { describe, expect, it } from 'vitest';
import { applyWalkthrough, matchesWalkthrough, WALKTHROUGH_FIELDS, WALKTHROUGH_SCRIPT } from './walkthrough';
import type { SummaryField } from './types';

// How Chrome's speech-to-text tends to write it: no punctuation, numbers as words, "milligrams", "wait list".
const SPOKEN =
  'I have been feeling down for about eight months and dont feel like myself around eighty percent of the time in a week ' +
  'I lost interest in a lot of stuff I used to enjoy I pulled away from my friends ive had trouble getting to sleep and then ' +
  'ive had trouble getting out of bed in the morning for a few months now ive missed four days of work this past month ' +
  'ive tried taking walks at least once a day I started taking 50 milligrams of sertraline two months ago and although it took ' +
  'some of the edge off it makes me so nauseous Im not sure I can keep taking it Im hoping to start therapy but I am still on the wait list';

const engine: SummaryField[] = [
  { key: 'symptoms', label: 'Symptoms', clinical: 'Low mood' },
  { key: 'onset', label: 'Onset', clinical: 'Not discussed' },
  { key: 'frequency', label: 'Frequency', clinical: 'Not discussed' },
  { key: 'severity', label: 'Severity', clinical: 'Not discussed' },
  { key: 'triggers', label: 'Triggers', clinical: 'Not discussed' },
  { key: 'tried', label: 'Tried', clinical: 'Not discussed' },
];

describe('demo walkthrough (Name how I feel)', () => {
  it('recognises the script, typed or spoken', () => {
    expect(matchesWalkthrough(WALKTHROUGH_SCRIPT)).toBe(true);
    expect(matchesWalkthrough(SPOKEN)).toBe(true);
  });

  it('still recognises it with a couple of words misheard', () => {
    expect(matchesWalkthrough(SPOKEN.replace('nauseous', 'notions').replace('lost interest', 'lost in arrest'))).toBe(true);
  });

  it('ignores anything else, or only part of the script', () => {
    expect(matchesWalkthrough('I can’t sleep and I feel tired all day. It’s been like this for months.')).toBe(false);
    expect(matchesWalkthrough(SPOKEN.slice(0, 200))).toBe(false);
  });

  it('shows only the walkthrough lines: no Main concerns, no quotes', () => {
    const out = applyWalkthrough(engine.map((f) => ({ ...f, quote: 'something I said' })), SPOKEN);
    expect(out.map((f) => f.key)).toEqual(['onset', 'frequency', 'severity', 'triggers', 'tried']);
    expect(out.every((f) => f.quote === undefined)).toBe(true);
    for (const [k, v] of Object.entries(WALKTHROUGH_FIELDS)) expect(out.find((f) => f.key === k)?.clinical).toBe(v);
    expect(applyWalkthrough(engine, 'Something else entirely')).toBe(engine);
  });
});

import { matchesVisitNotes, matchesVisitRecording, VISIT_NOTES, VISIT_SCRIPT } from './walkthrough';

// Speech-to-text of the conversation: one voice stream, no speaker names, "four weeks" in words, "bupropion" misheard.
const HEARD =
  'hi doctor thanks for seeing me today the sertraline has been causing constant nausea which has made getting through the day really tough ' +
  'I see hmm you shouldnt have to push through feeling sick all the time lets switch you from sertraline to view pro peon instead its much easier on your stomach ' +
  'I see from your notes youve had low moods we need to take that seriously Im sending a referral to a therapist for you this week to give you extra support ' +
  'thats a huge relief when should I come back to see how things are going lets plan to check back in four weeks so we can see if the view pro peon is helping and your nausea stays away';

describe('demo walkthrough (At the visit)', () => {
  it('recognises the conversation, even with a misheard drug name', () => {
    expect(matchesVisitRecording(VISIT_SCRIPT)).toBe(true);
    expect(matchesVisitRecording(HEARD)).toBe(true);
  });
  it('recognises the quick notes', () => {
    expect(matchesVisitNotes(VISIT_NOTES)).toBe(true);
    expect(matchesVisitNotes('dr lane switching sertraline to bupropion for the nausea therapist referral this week recheck in four weeks')).toBe(true);
  });
  it('ignores other visits', () => {
    expect(matchesVisitRecording('The doctor said my blood pressure is fine and to come back in a year.')).toBe(false);
    expect(matchesVisitNotes('Blood test next week. Keep the same dose.')).toBe(false);
  });
});
