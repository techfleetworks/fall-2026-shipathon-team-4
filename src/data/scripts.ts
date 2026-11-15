/**
 * Advocacy script library (PRD F7). Placeholder content written to the §6.0 rules:
 * calm, collaborative, factual; questions instead of demands; never asks for a
 * specific drug. Needs PM/clinical review before real use.
 */
export type ScriptCategory = 'Being dismissed' | 'Side effects' | 'Document this' | 'Escalate';

export interface Script {
  id: string;
  category: ScriptCategory;
  situation: string;
  text: string;
  /** PB2 practice: what the doctor might say (practice only, framed respectfully). */
  doctor?: string;
  /** PB2 practice: the same ask, said more firmly (still polite, still a question). */
  firmer?: string;
  /** PB2 practice: "Why this works". */
  why?: string;
}

export const SCRIPT_CATEGORIES: ScriptCategory[] = ['Being dismissed', 'Side effects', 'Document this', 'Escalate'];

export const SCRIPTS: Script[] = [
  // Being dismissed
  {
    id: 'dismiss-anxiety',
    category: 'Being dismissed',
    situation: 'If you hear “it’s just anxiety”',
    text: 'I understand that’s possible. Can you note in my chart that I reported [symptom] and what you ruled out?',
    doctor: 'It sounds like stress. Try to get more rest.',
    firmer: 'I hear you, but I don’t think this is only stress. I’d like it noted in my chart that I reported [symptom] and what was ruled out.',
    why: 'Asking for it to be written down is calm and fair, and it makes sure what you reported is recorded.',
  },
  {
    id: 'dismiss-depression',
    category: 'Being dismissed',
    situation: 'If you hear “it’s probably the depression”',
    text: 'I understand it could be the depression. It started right after [change], though. Could we check whether something else is going on?',
    doctor: 'This is probably part of the depression.',
    firmer: 'It started right after [change], not before. I’d like us to check for other causes before we put it down to the depression.',
    why: 'Pointing to the timing gives the doctor a fact to work with, not just a feeling.',
  },
  {
    id: 'dismiss-looks-fine',
    category: 'Being dismissed',
    situation: 'If you hear “you seem to be doing well”',
    text: 'I know I can come across as fine. On most days this is a [7]/10, and it’s stopping me from [activity]. I’d like that to be part of how we plan.',
    doctor: 'You seem to be doing pretty well.',
    firmer: 'I know I look fine, but this is a [7]/10 most days and I can’t [activity]. Please factor that into the plan.',
    why: 'A number and one concrete example make severity easy to see, even when you look composed.',
  },
  {
    id: 'dismiss-time',
    category: 'Being dismissed',
    situation: 'If you hear “let’s give it more time”',
    text: 'I can do that. What should I watch for, and at what point should I call you instead of waiting?',
    doctor: 'Let’s give it a few more weeks.',
    firmer: 'I can wait, but I need to know what to watch for and the point where I should call you rather than wait.',
    why: 'Agreeing to wait while asking for a clear threshold keeps you safe and keeps things moving.',
  },
  // Side effects
  {
    id: 'side-effect-weekly',
    category: 'Side effects',
    situation: 'Side effects',
    text: 'Since starting [med], I’ve had [effect] [x] times a week. What are my options?',
    doctor: 'Some side effects are normal at first.',
    firmer: 'This is happening [x] times a week and it’s affecting my day. I’d like to talk about options today.',
    why: 'How often it happens turns a vague complaint into something measurable.',
  },
  {
    id: 'side-effect-timing',
    category: 'Side effects',
    situation: 'When timing points to the medication',
    text: 'This started within days of the dose change, not before. Could the [med] be causing it?',
    doctor: 'That’s probably not the medication.',
    firmer: 'The timing lines up exactly with the dose change. Could we look at whether the [med] is the cause before ruling it out?',
    why: 'Putting the two dates side by side makes the connection hard to miss.',
  },
  {
    id: 'side-effect-options',
    category: 'Side effects',
    situation: 'Asking about options',
    text: 'What are the options here — lowering the dose, switching, or changing when I take it? What would you recommend and why?',
    doctor: 'Let’s just keep going as we are.',
    firmer: 'I’d like to understand my options before we decide — lowering the dose, switching, or changing the timing. Which would you recommend, and why?',
    why: 'Asking for the options and the reasoning keeps the decision shared, without asking for a specific drug.',
  },
  // Document this
  {
    id: 'doc-chart',
    category: 'Document this',
    situation: 'Getting it in your chart',
    text: 'Could you please add to my chart that I reported [symptom] today, and what we decided about it?',
    doctor: 'Okay, we’ll keep an eye on it.',
    firmer: 'Before we finish, please add to my chart that I reported [symptom] today and what we decided.',
    why: 'A written record means the next clinician sees it too, so you don’t start from scratch.',
  },
  {
    id: 'doc-declined',
    category: 'Document this',
    situation: 'If a test or referral is declined',
    text: 'I’d like my request for [test / referral] and the reason it wasn’t ordered to be noted in my chart.',
    doctor: 'I don’t think we need that test right now.',
    firmer: 'I understand. I’d still like my request and the reason it wasn’t ordered written in my chart.',
    why: 'Asking for the reason to be noted is respectful and makes the decision visible.',
  },
  {
    id: 'doc-history',
    category: 'Document this',
    situation: 'When history is ignored',
    text: 'I raised this at my visit on [date] too. Could we look at it together with today, rather than on its own?',
    doctor: 'Let’s focus on what’s going on today.',
    firmer: 'This is connected to what I raised on [date]. I’d like us to look at both together, not separately.',
    why: 'Linking visits shows a pattern that one appointment on its own can hide.',
  },
  // Escalate
  {
    id: 'esc-followup',
    category: 'Escalate',
    situation: 'If you leave without a clear next step',
    text: 'Before I go, what is the next step, and when should I expect to hear back?',
    doctor: 'Okay, I think that’s everything for today.',
    firmer: 'Before I leave, I need a clear next step and a date when I’ll hear back.',
    why: 'Ending with a concrete next step means nothing gets lost after you walk out.',
  },
  {
    id: 'esc-second',
    category: 'Escalate',
    situation: 'Asking for another opinion',
    text: 'I’d feel better getting a second opinion on this. Could you refer me to [specialist], or tell me how to arrange one?',
    doctor: 'I don’t think a referral is necessary.',
    firmer: 'I’d still like a second opinion. If you won’t refer me, can you note that in my chart and tell me how to arrange one?',
    why: 'Asking calmly for another opinion is a normal part of care, and asking for it to be noted keeps it on record.',
  },
  {
    id: 'esc-worse',
    category: 'Escalate',
    situation: 'If things get worse before the next visit',
    text: 'If this gets worse before our next appointment, who should I contact, and how quickly can I be seen?',
    doctor: 'Just come back if it gets worse.',
    firmer: 'I need to know exactly who to contact and how fast I can be seen if this gets worse before our next visit.',
    why: 'Knowing who to call ahead of time means you don’t have to work it out on a bad day.',
  },
];
