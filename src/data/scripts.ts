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
}

export const SCRIPT_CATEGORIES: ScriptCategory[] = ['Being dismissed', 'Side effects', 'Document this', 'Escalate'];

export const SCRIPTS: Script[] = [
  // Being dismissed
  {
    id: 'dismiss-anxiety',
    category: 'Being dismissed',
    situation: 'If you hear “it’s just anxiety”',
    text: 'I understand that’s possible. Can you note in my chart that I reported [symptom] and what you ruled out?',
  },
  {
    id: 'dismiss-depression',
    category: 'Being dismissed',
    situation: 'If you hear “it’s probably the depression”',
    text: 'I understand it could be the depression. It started right after [change], though. Could we check whether something else is going on?',
  },
  {
    id: 'dismiss-looks-fine',
    category: 'Being dismissed',
    situation: 'If you hear “you seem to be doing well”',
    text: 'I know I can come across as fine. On most days this is a [7]/10, and it’s stopping me from [activity]. I’d like that to be part of how we plan.',
  },
  {
    id: 'dismiss-time',
    category: 'Being dismissed',
    situation: 'If you hear “let’s give it more time”',
    text: 'I can do that. What should I watch for, and at what point should I call you instead of waiting?',
  },
  // Side effects
  {
    id: 'side-effect-weekly',
    category: 'Side effects',
    situation: 'Side effects',
    text: 'Since starting [med], I’ve had [effect] [x] times a week. What are my options?',
  },
  {
    id: 'side-effect-timing',
    category: 'Side effects',
    situation: 'When timing points to the medication',
    text: 'This started within days of the dose change, not before. Could the [med] be causing it?',
  },
  {
    id: 'side-effect-options',
    category: 'Side effects',
    situation: 'Asking about options',
    text: 'What are the options here — lowering the dose, switching, or changing when I take it? What would you recommend and why?',
  },
  // Document this
  {
    id: 'doc-chart',
    category: 'Document this',
    situation: 'Getting it in your chart',
    text: 'Could you please add to my chart that I reported [symptom] today, and what we decided about it?',
  },
  {
    id: 'doc-declined',
    category: 'Document this',
    situation: 'If a test or referral is declined',
    text: 'I’d like my request for [test / referral] and the reason it wasn’t ordered to be noted in my chart.',
  },
  {
    id: 'doc-history',
    category: 'Document this',
    situation: 'When history is ignored',
    text: 'I raised this at my visit on [date] too. Could we look at it together with today, rather than on its own?',
  },
  // Escalate
  {
    id: 'esc-followup',
    category: 'Escalate',
    situation: 'If you leave without a clear next step',
    text: 'Before I go, what is the next step, and when should I expect to hear back?',
  },
  {
    id: 'esc-second',
    category: 'Escalate',
    situation: 'Asking for another opinion',
    text: 'I’d feel better getting a second opinion on this. Could you refer me to [specialist], or tell me how to arrange one?',
  },
  {
    id: 'esc-worse',
    category: 'Escalate',
    situation: 'If things get worse before the next visit',
    text: 'If this gets worse before our next appointment, who should I contact, and how quickly can I be seen?',
  },
];
