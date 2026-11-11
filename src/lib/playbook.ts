/**
 * "Make a playbook for my visit" — RULE-BASED for now (the site map calls these
 * AI-generated; an LLM can replace this later). It only rearranges what the
 * patient already said plus reviewed scripts. It never diagnoses or suggests a drug.
 */
import { PLAYBOOKS } from '../data/playbooks';
import { formatDate } from './dates';
import type { AppData } from './store';
import { selectLatestSummary, selectUpcomingVisit } from './store';
import type { MyPlaybook } from './types';

export function draftPlaybook(s: AppData): Omit<MyPlaybook, 'id' | 'createdAt'> {
  const latest = selectLatestSummary(s);
  const visit = selectUpcomingVisit(s);
  const field = (k: string) => {
    const f = latest?.fields.find((x) => x.key === k);
    return f && f.clinical !== 'Not discussed' ? f.clinical : undefined;
  };
  const symptoms = field('symptoms');
  const onset = field('onset');
  const severity = field('severity');
  const reasons = s.profile?.reasons ?? [];
  const brushedOff = s.profile?.brushedOff;
  const medChange = !!s.medications.length || /medic|dose|started|after/i.test(onset ?? '') || reasons.includes('Side effects from medicine');

  const priorities = visit?.priorities.length ? visit.priorities : (symptoms?.split('; ').slice(0, 3) ?? []);
  const lead = priorities[0] ?? symptoms?.split('; ')[0];
  const opening = lead
    ? `I’d like to start with ${lead.charAt(0).toLowerCase() + lead.slice(1)}.${onset ? ` When it started: ${onset}.` : ''}${severity ? ` How bad: ${severity}.` : ''}`
    : 'I’d like to start with what’s been hardest lately, and how long it’s been going on.';

  const ids: string[] = [];
  if (medChange) ids.push('side-effect-timing', 'side-effect-options');
  if (brushedOff === 'Yes' || brushedOff === 'Not sure') {
    ids.push(reasons.includes('Worry or anxiety') && !reasons.includes('Low mood') ? 'dismiss-anxiety' : 'dismiss-depression');
  }
  if (severity) ids.push('dismiss-looks-fine');
  ids.push('doc-chart', 'esc-followup');
  const scriptIds = [...new Set(ids)].slice(0, 4);

  const peer = PLAYBOOKS.map((p) => ({ p, overlap: p.scriptIds.filter((x) => scriptIds.includes(x)).length }))
    .sort((a, b) => b.overlap - a.overlap)[0];

  return {
    visitId: visit?.id,
    title: visit ? `For ${formatDate(visit.date)}${visit.clinician ? ` · ${visit.clinician}` : ''}` : 'For my next visit',
    opening,
    priorities,
    scriptIds,
    askingFor: visit?.askingFor ?? [],
    peerPlaybookId: peer && peer.overlap > 0 ? peer.p.id : undefined,
  };
}
