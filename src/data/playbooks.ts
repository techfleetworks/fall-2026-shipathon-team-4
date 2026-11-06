/**
 * Peer playbooks: what worked for people in similar situations.
 * SYNTHETIC — based on the Starter Pack's dismissal patterns, not real people.
 */
export interface Playbook {
  id: string;
  title: string;
  pattern: string;
  summary: string;
  steps: string[];
  scriptIds: string[];
  fromPeer: string;
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'side-effect-as-illness',
    title: 'When a side effect gets called “just the depression”',
    pattern: 'Side effect read as the illness',
    summary: 'New symptoms right after a medication change were put down to the condition itself.',
    steps: [
      'Write down the date of the dose change and the date the symptom started.',
      'Lead with the timing: “It started after the change, not before.”',
      'Ask it as a question: “Could the medication be causing this?”',
      'Ask what to watch for, and when to call instead of waiting.',
      'Ask for the conversation to be noted in your chart.',
    ],
    scriptIds: ['dismiss-depression', 'side-effect-timing', 'side-effect-options'],
    fromPeer: '“Putting the two dates side by side changed the whole conversation.”',
  },
  {
    id: 'doesnt-fit',
    title: 'When symptoms don’t fit the diagnosis',
    pattern: 'Physical illness under a mental-health label',
    summary: 'Physical signs (rash, joint pain, racing heart, tremor) were folded into an existing diagnosis.',
    steps: [
      'List the symptoms that feel different from your usual condition.',
      'Group the physical ones together so they’re seen as a set.',
      'Ask: “Could something medical explain these?”',
      'If a test is declined, ask for the reason to be noted.',
    ],
    scriptIds: ['dismiss-anxiety', 'doc-declined', 'esc-second'],
    fromPeer: '“Grouping the physical symptoms on one line is what got me a blood test.”',
  },
  {
    id: 'doesnt-look-sick',
    title: 'When you “don’t look sick”',
    pattern: 'Severity under-rated',
    summary: 'Coming across as composed led to the severity being under-rated.',
    steps: [
      'Use a number: rate how bad it is on most days, 0–10.',
      'Name one thing it stops you from doing.',
      'Say out loud that you may come across as fine.',
    ],
    scriptIds: ['dismiss-looks-fine', 'doc-chart'],
    fromPeer: '“Saying ‘I know I look fine’ out loud took the pressure off.”',
  },
  {
    id: 'named-a-medication',
    title: 'When naming what helped before gets you labeled',
    pattern: 'Credibility undercut',
    summary: 'Mentioning a medication that helped in the past led to being treated as suspect.',
    steps: [
      'Describe your treatment history as facts: what, when, what happened.',
      'Focus on the symptoms you want treated, not a specific drug.',
      'Ask: “What options do you think fit?”',
    ],
    scriptIds: ['side-effect-options', 'doc-history'],
    fromPeer: '“Sticking to dates and what happened made it feel like a normal conversation again.”',
  },
];
