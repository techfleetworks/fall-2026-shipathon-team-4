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

/** Situation chips on the PB1 form. */
export const MAKE_SITUATIONS = ['Being brushed off', 'Side effects', 'Asking for a referral', 'Getting it in my chart'] as const;
export type MakeSituation = (typeof MAKE_SITUATIONS)[number];

/** What the PB1 form asks. All optional: with none, the playbook is built from history alone. */
export interface PlaybookRequest {
  /** "What are you worried might happen?" — used only to pick scripts and a title; never stored. */
  worry?: string;
  situation?: MakeSituation;
  /** "For which visit?" */
  visitId?: string;
  /** "Make an AI version for me" from someone else's playbook. */
  basedOn?: string;
}

/** Which "it's just…" the worry is about, if any. */
function brushOffScript(worry: string, fallbackId: string): { id: string; title: string } {
  const w = worry.toLowerCase();
  if (/stress/.test(w)) return { id: 'dismiss-anxiety', title: 'If you hear “it’s just stress”' };
  if (/anxi/.test(w)) return { id: 'dismiss-anxiety', title: 'If you hear “it’s just anxiety”' };
  if (/depress/.test(w)) return { id: 'dismiss-depression', title: 'If you hear “it’s the depression”' };
  if (/fine|well|look/.test(w)) return { id: 'dismiss-looks-fine', title: 'If you hear “you seem fine”' };
  if (/time|wait/.test(w)) return { id: 'dismiss-time', title: 'If you hear “give it more time”' };
  return { id: fallbackId, title: 'If you get brushed off' };
}

export function draftPlaybook(s: AppData, req: PlaybookRequest = {}): Omit<MyPlaybook, 'id' | 'createdAt'> {
  const latest = selectLatestSummary(s);
  const visit = (req.visitId && s.visits.find((v) => v.id === req.visitId)) || selectUpcomingVisit(s);
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

  const fallbackDismiss = reasons.includes('Worry or anxiety') && !reasons.includes('Low mood') ? 'dismiss-anxiety' : 'dismiss-depression';
  let ids: string[] = [];
  let title: string | undefined;
  switch (req.situation) {
    case 'Being brushed off': {
      const b = brushOffScript(req.worry ?? '', fallbackDismiss);
      ids = [b.id, 'doc-chart', 'esc-followup'];
      title = b.title;
      break;
    }
    case 'Side effects':
      ids = ['side-effect-timing', 'side-effect-weekly', 'side-effect-options'];
      title = 'Asking about side effects';
      break;
    case 'Asking for a referral':
      ids = ['esc-second', 'doc-declined', 'esc-followup'];
      title = 'Asking for a referral';
      break;
    case 'Getting it in my chart':
      ids = ['doc-chart', 'doc-declined', 'doc-history'];
      title = 'Getting it in my chart';
      break;
    default:
      if (medChange) ids.push('side-effect-timing', 'side-effect-options');
      if (brushedOff === 'Yes' || brushedOff === 'Not sure') ids.push(fallbackDismiss);
      if (severity) ids.push('dismiss-looks-fine');
      ids.push('doc-chart', 'esc-followup');
  }
  const based = req.basedOn ? PLAYBOOKS.find((p) => p.id === req.basedOn) : undefined;
  if (based) ids = [...based.scriptIds, ...ids];
  const scriptIds = [...new Set(ids)].slice(0, 4);

  const peer = based ?? PLAYBOOKS
    .map((p) => ({ p, overlap: p.scriptIds.filter((x) => scriptIds.includes(x)).length }))
    .sort((a, b) => b.overlap - a.overlap)
    .find((x) => x.overlap > 0)?.p;

  return {
    visitId: visit?.id,
    title: title ?? (visit ? `For ${formatDate(visit.date)}${visit.clinician ? ` · ${visit.clinician}` : ''}` : 'For my next visit'),
    opening,
    priorities,
    scriptIds,
    askingFor: visit?.askingFor ?? [],
    peerPlaybookId: peer?.id,
  };
}
