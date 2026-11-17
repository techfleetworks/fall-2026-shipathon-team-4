import { describe, expect, it } from 'vitest';
import { SCRIPTS } from '../../data/scripts.js';
import { checkOutput } from '../guardrails/checks.js';
import { MAX_CUES, TRIGGERS, detectCues, fillBlanks, mentions, type CueContext } from './cues.js';

const ctx: CueContext = {
  priorities: ['Dizzy and lightheaded when standing up', 'Daytime sleepiness since the dose increase'],
  covered: [],
  latestMedChange: { label: 'Ziprasidone dose increased', date: '2026-10-11' },
  lastVisitDate: '2026-11-07',
};
const ids = (texts: string[], c: CueContext = ctx) => detectCues(texts, c).cues.map((x) => x.id);

describe('be-believed cues: the moments', () => {
  it.each([
    ['It is probably just anxiety', 'dismiss-anxiety'],
    ["I think it's stress, honestly", 'dismiss-anxiety'],
    ["It's all in your head", 'dismiss-anxiety'],
    ["It's probably the depression", 'dismiss-depression'],
    ['That can be part of your depression', 'dismiss-depression'],
    ['You seem to be doing well overall', 'dismiss-looks-fine'],
    ["Let's give it more time", 'dismiss-time'],
    ['Your body will adjust', 'dismiss-time'],
    ["It's unlikely to be the medication", 'side-effect-timing'],
    ["You don't need a referral right now", 'doc-declined'],
    ["I'm not going to order that", 'doc-declined'],
  ])('"%s" → %s', (said, id) => {
    expect(ids([said])).toEqual([id]);
  });

  it.each([
    'Tell me about your anxiety this month',
    'How is your depression treatment going?',
    'We will check your blood pressure standing up',
    'The medication dose went up five weeks ago',
  ])('ordinary talk is not a cue: "%s"', (said) => {
    expect(ids([said])).toEqual([]);
  });
});

describe('be-believed cues: what they say', () => {
  it('the cue is the reviewed playbook line, with blanks filled from the record', () => {
    const [cue] = detectCues(["It's probably the depression"], ctx).cues;
    expect(cue.situation).toBe(SCRIPTS.find((s) => s.id === 'dismiss-depression')!.situation);
    expect(cue.say).toBe('I understand it could be the depression. It started right after the medication change on Oct 11, though. Could we check whether something else is going on?');
    expect(cue.heard).toBe("It's probably the depression");
  });

  it('fills [symptom] with the first talking point not covered yet', () => {
    expect(fillBlanks('I reported [symptom].', ctx)).toBe('I reported dizzy and lightheaded when standing up.');
    expect(fillBlanks('I reported [symptom].', { ...ctx, covered: [ctx.priorities[0]] })).toBe('I reported daytime sleepiness since the dose increase.');
  });

  it('leaves a blank it cannot fill for the person to fill', () => {
    expect(fillBlanks('After [change], on [date]', { priorities: [], covered: [] })).toBe('After [change], on [date]');
  });

  it('every playbook line a cue can show passes the guardrails (questions, no advice or diagnosis)', () => {
    for (const t of TRIGGERS) {
      const s = SCRIPTS.find((x) => x.id === t.scriptId)!;
      expect(s, t.scriptId).toBeDefined();
      expect(checkOutput(fillBlanks(s.text, ctx), { input: ctx.priorities.join(' ') + ' Ziprasidone dose increased' }).ok, t.scriptId).toBe(true);
    }
  });
});

describe('be-believed cues: how many and when', () => {
  it('one cue per moment, newest first, at most 2', () => {
    const said = ["It's probably the depression", 'Give it time', "It's probably the depression", 'You seem fine'];
    expect(ids(said)).toEqual(['dismiss-looks-fine', 'dismiss-time']);
    expect(MAX_CUES).toBe(2);
  });

  it('a dismissed cue ("Got it") does not come back', () => {
    expect(ids(["It's probably the depression"], { ...ctx, dismissed: ['dismiss-depression'] })).toEqual([]);
  });

  it('no cues when crisis language was heard (the 988 banner shows instead)', () => {
    expect(detectCues(["It's probably the depression", 'I want to hurt myself'], ctx)).toEqual({ cues: [], coveredSuggestions: [] });
  });

  it('nothing said yet → nothing shown', () => {
    expect(detectCues([], ctx)).toEqual({ cues: [], coveredSuggestions: [] });
  });
});

describe('talking points that came up (to tick, never ticked automatically)', () => {
  it('notices a talking point said in other words (same symptom in doctor terms)', () => {
    expect(mentions('I get lightheaded when I get up from a chair', 'Dizzy and lightheaded when standing up')).toBe(true);
    expect(detectCues(['so the dizziness when you stand up, tell me more'], ctx).coveredSuggestions).toEqual(['Dizzy and lightheaded when standing up']);
  });

  it('already ticked points are not suggested again; unrelated talk suggests nothing', () => {
    expect(detectCues(['dizzy when standing'], { ...ctx, covered: [ctx.priorities[0]] }).coveredSuggestions).toEqual([]);
    expect(detectCues(['How was the drive in today?'], ctx).coveredSuggestions).toEqual([]);
  });
});
