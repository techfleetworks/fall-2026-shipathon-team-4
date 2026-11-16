/**
 * Others' playbooks (PB3/PB4): approaches other patients say worked for them.
 * SYNTHETIC — a small curated set based on the Starter Pack's dismissal patterns,
 * not real people. The "said it helped" numbers are placeholders until real,
 * anonymous ratings exist ("Share what helped"); the page says so.
 */

/** Plain-language mood conditions used as filters (PB3 "Conditions"). */
export const CONDITIONS = [
  'Depression (MDD)',
  'Long-term depression (PDD)',
  'Bipolar',
  'Mood swings (cyclothymia)',
  'Mood changes from meds or substances',
] as const;
export type Condition = (typeof CONDITIONS)[number];

/** Situations, shared by the PB1 form and the PB3 filters. */
export const SITUATIONS = ['First visit', 'Side effects', 'Being brushed off', 'Getting it in my chart', 'Asking for a referral'] as const;
export type Situation = (typeof SITUATIONS)[number];

export type PlaybookArt = 'log' | 'opinion' | 'meds' | 'chart' | 'talk';

export interface Playbook {
  id: string;
  /** First-person title, shown in quotes. */
  title: string;
  conditions: Condition[];
  situations: Situation[];
  /** e.g. "primary care", "psychiatry". */
  setting: string;
  /** "What they did". */
  steps: string[];
  /** "Try saying". */
  trySaying: string;
  /** Scripts added to your visit with "Add to my next visit". */
  scriptIds: string[];
  /** Placeholder stats: % who said it helped, out of how many who tried it. */
  helped: { pct: number; of: number };
  art: PlaybookArt;
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'symptom-log',
    title: 'I brought a symptom log and they finally listened',
    conditions: ['Depression (MDD)', 'Long-term depression (PDD)'],
    situations: ['Being brushed off', 'First visit'],
    setting: 'primary care',
    steps: [
      'Tracked mood and sleep for 3 weeks.',
      'Led with how it affected work.',
      'Asked what would happen if it didn’t improve.',
    ],
    trySaying: 'Here’s what the last three weeks looked like. What do you think is going on?',
    scriptIds: ['dismiss-looks-fine', 'esc-followup'],
    helped: { pct: 84, of: 210 },
    art: 'log',
  },
  {
    id: 'second-opinion',
    title: 'How I asked for a second opinion',
    conditions: ['Depression (MDD)', 'Bipolar'],
    situations: ['Asking for a referral'],
    setting: 'psychiatry',
    steps: [
      'Said what I’d already tried and for how long.',
      'Asked it as a question, not a complaint.',
      'Asked for the referral to be noted in my chart.',
    ],
    trySaying: 'I’d feel better getting another view on this. Could you refer me, or tell me how to arrange it?',
    scriptIds: ['esc-second', 'doc-declined'],
    helped: { pct: 71, of: 96 },
    art: 'opinion',
  },
  {
    id: 'side-effect-seriously',
    title: 'Getting a side effect taken seriously',
    conditions: ['Depression (MDD)', 'Mood changes from meds or substances'],
    situations: ['Side effects'],
    setting: 'primary care',
    steps: [
      'Wrote down the date of the dose change and the date the symptom started.',
      'Led with the timing: it started after the change, not before.',
      'Asked what the options were.',
    ],
    trySaying: 'This started within days of the dose change. Could the medication be causing it?',
    scriptIds: ['side-effect-timing', 'side-effect-options'],
    helped: { pct: 78, of: 143 },
    art: 'meds',
  },
  {
    id: 'in-my-chart',
    title: 'Asking for it to go in my chart changed the tone',
    conditions: ['Depression (MDD)', 'Long-term depression (PDD)', 'Bipolar'],
    situations: ['Getting it in my chart', 'Being brushed off'],
    setting: 'primary care',
    steps: [
      'Stayed calm and kept it short.',
      'Asked for what I reported to be written down.',
      'Asked what we decided, so it was on record too.',
    ],
    trySaying: 'Could you add to my chart what I reported today, and what we decided about it?',
    scriptIds: ['doc-chart', 'doc-history'],
    helped: { pct: 69, of: 88 },
    art: 'chart',
  },
  {
    id: 'look-fine',
    title: 'Saying “I know I look fine” out loud',
    conditions: ['Depression (MDD)', 'Mood swings (cyclothymia)'],
    situations: ['Being brushed off'],
    setting: 'primary care',
    steps: [
      'Rated how bad it is on most days, 0–10.',
      'Named one thing it stops me from doing.',
      'Said out loud that I may come across as fine.',
    ],
    trySaying: 'I know I can come across as fine. On most days this is a 7 out of 10, and it’s stopping me from working.',
    scriptIds: ['dismiss-looks-fine', 'doc-chart'],
    helped: { pct: 74, of: 121 },
    art: 'talk',
  },
  {
    id: 'first-visit-mood',
    title: 'What I said at my first visit about my moods',
    conditions: ['Bipolar', 'Mood swings (cyclothymia)'],
    situations: ['First visit'],
    setting: 'primary care',
    steps: [
      'Described the highs as well as the lows.',
      'Gave dates for the last few changes.',
      'Asked what the next step would be before leaving.',
    ],
    trySaying: 'It’s not only low moods — I also have stretches where I barely sleep and feel wired. Can we talk about both?',
    scriptIds: ['doc-history', 'esc-followup'],
    helped: { pct: 81, of: 64 },
    art: 'talk',
  },
];
