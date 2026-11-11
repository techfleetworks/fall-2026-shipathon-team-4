import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { IconTrash } from '../components/Icons';
import { Chip, ConfirmButton } from '../components/ui';
import { daysUntil, formatDate, formatShort, todayISO } from '../lib/dates';
import { hasCrisisLanguage } from '../lib/safety';
import { selectLatestSummary, selectUpcomingVisit, useApp } from '../lib/store';
import type { Evidence, ShareLink, Visit } from '../lib/types';
import { ImportView } from './visit/Before';
import { beforeSteps, formatTime, Modal } from './visit/common';

function whoLabel(v: Visit) {
  if (v.clinician) return v.specialty ? `${v.clinician}, ${v.specialty.toLowerCase()}` : v.clinician;
  return v.specialty ?? 'Visit';
}

const SPECIALTIES = ['Primary care', 'Psychiatrist', 'Therapist', 'ER / hospital', 'Other'];

/* ======================================================================
   V1 · Visits: all visits
   ====================================================================== */

export function Visits({ adding = false }: { adding?: boolean }) {
  const state = useApp();
  const today = todayISO();
  const upcoming = state.visits.filter((v) => v.date >= today && !v.checkIn).sort((a, b) => a.date.localeCompare(b.date));
  const past = state.visits.filter((v) => !upcoming.includes(v)).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Shell header={{ kind: 'brand' }} tabs wide>
      <div className="visit-page">
        <div className="page-head">
          <h1>Visits</h1>
          <div className="btn-row">
            <Link to="/visits/history" className="btn btn--outline">My history</Link>
            <Link to="/visits/new" className="btn btn--primary">+ Add a visit</Link>
          </div>
        </div>

        <h2 className="section-label">Upcoming</h2>
        {upcoming.length === 0 && (
          <div className="visit-card">
            <div><span className="visit-card__title">No visit coming up</span><span className="muted">Add one and we’ll help you get ready, step by step.</span></div>
            <Link to="/visits/new" className="btn btn--primary">Add a visit</Link>
          </div>
        )}
        {upcoming.map((v, i) => <UpcomingCard key={v.id} v={v} highlight={i === 0} />)}

        <h2 className="section-label">Past</h2>
        {past.length === 0 && <p className="small muted">None yet.</p>}
        {past.map((v) => <PastCard key={v.id} v={v} />)}
      </div>
      {adding && <AddVisitDialog />}
    </Shell>
  );
}

function UpcomingCard({ v, highlight }: { v: Visit; highlight: boolean }) {
  const state = useApp();
  const steps = beforeSteps(state, v);
  const done = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);
  const d = daysUntil(v.date);
  return (
    <div className={`visit-card${highlight ? ' visit-card--next' : ''}`}>
      <div>
        <span className="visit-card__title">{formatShort(v.date)}{v.time ? `, ${formatTime(v.time)}` : ''} · {whoLabel(v)}</span>
        <span className="muted">Before the visit: {done} of {steps.length} steps done{v.reason ? ` · ${v.reason}` : ''}</span>
      </div>
      <div className="visit-card__end">
        <span className="pill pill--amber">{d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`}</span>
        <Link to={d === 0 ? `/visits/${v.id}/at` : `/visits/${v.id}/before${nextStep?.slug ? `/${nextStep.slug}` : ''}`} className="btn btn--primary">
          {d === 0 ? 'Open visit' : done ? 'Continue prep' : 'Start prep'}
        </Link>
      </div>
    </div>
  );
}

function PastCard({ v }: { v: Visit }) {
  const followUps = useApp((s) => s.followUps).filter((f) => f.visitId === v.id && !f.outcome);
  const deleteVisit = useApp((s) => s.deleteVisit);
  const due = followUps.find((f) => f.dueDate <= todayISO());
  const next = followUps[0];
  const ci = v.checkIn;
  const summary = ci
    ? [`Felt heard ${ci.feltHeard}/5`, next ? `Next step: ${next.step.toLowerCase()}, due ${formatShort(next.dueDate)}` : ci.nextStepAgreed === 'Yes' || ci.nextSteps?.some((s) => s !== 'None given') ? 'Next step agreed' : 'No clear next step'].join(' · ')
    : 'No check-in yet';
  return (
    <div className="visit-card">
      <div>
        <span className="visit-card__title">{formatShort(v.date)} · {whoLabel(v)}</span>
        <span className="muted">{summary}</span>
      </div>
      <div className="visit-card__end">
        {due && <span className="tag">Follow-up due</span>}
        {!ci && <span className="tag">Check-in</span>}
        <Link to={`/visits/${v.id}/after${ci ? (due ? '/next-steps' : '') : v.recap || v.notes ? '' : '/check-in'}`} className="btn btn--outline">Open</Link>
        <ConfirmButton className="icon-btn" ariaLabel={`Delete visit on ${formatShort(v.date)}`} question="Delete this visit for good?" confirmLabel="Delete" onConfirm={() => deleteVisit(v.id)}>
          <IconTrash width={16} height={16} />
        </ConfirmButton>
      </div>
    </div>
  );
}

/* ======================================================================
   V2 · Add a visit (dialog)
   ====================================================================== */

function AddVisitDialog() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const addVisit = useApp((s) => s.addVisit);
  const [when, setWhen] = useState(params.get('date') ? `${params.get('date')}T09:00` : '');
  const [who, setWho] = useState(params.get('with') ?? '');
  const [specialty, setSpecialty] = useState<string | undefined>();
  const [reason, setReason] = useState('');
  const date = when.slice(0, 10);
  const time = when.length > 10 ? when.slice(11, 16) : undefined;
  const isPast = !!date && date < todayISO();
  const close = () => navigate('/visits');

  const save = () => {
    if (hasCrisisLanguage(reason, who)) { navigate('/help/now'); return; }
    const id = addVisit({ date, time, clinician: who.trim() || undefined, specialty, reason: reason.trim() || undefined });
    navigate(isPast ? `/visits/${id}/after/check-in` : `/visits/${id}/before`, { replace: true });
  };

  return (
    <Modal title="Add a visit" onClose={close}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (date) save(); }}>
        <div className="field">
          <label htmlFor="av-when">Date and time</label>
          <input id="av-when" type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
          {isPast && <span className="small muted">That’s in the past — we’ll go straight to a quick check-in.</span>}
        </div>
        <div className="field">
          <label htmlFor="av-who">Who are you seeing?</label>
          <input id="av-who" className="input" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Dr. name or clinic" />
        </div>
        <div className="chips" role="group" aria-label="Kind of visit">
          {SPECIALTIES.map((s) => <Chip key={s} selected={specialty === s} onClick={() => setSpecialty(specialty === s ? undefined : s)}>{s}</Chip>)}
        </div>
        <div className="field">
          <label htmlFor="av-why">What’s this visit for? <span className="muted">(optional)</span></label>
          <input id="av-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., follow-up on sleep and mood" />
        </div>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="link-btn" onClick={close}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={!date}>Add visit</button>
        </div>
      </form>
    </Modal>
  );
}

/* ======================================================================
   V3 · My history — doctor summary + timeline across all visits
   ====================================================================== */

type Filter = 'All' | 'Stories' | 'Visits' | 'Meds';

function evidenceTag(e: Evidence): { tag: string; filter: Filter[] } {
  if (e.title === 'Story saved') return { tag: 'Your words', filter: ['Stories'] };
  if (e.title === 'Imported note') return { tag: 'Import', filter: ['Stories'] };
  if (e.type === 'visit' || e.type === 'follow-up') return { tag: e.type === 'visit' ? 'Visit' : 'Follow-up', filter: ['Visits'] };
  if (e.type === 'medication') return { tag: 'Medication', filter: ['Meds'] };
  if (e.title === 'Side effect') return { tag: 'Side effect', filter: ['Meds', 'Stories'] };
  return { tag: e.title === 'Symptom' ? 'Symptom' : 'Note', filter: ['Stories'] };
}

export function VisitHistory() {
  const state = useApp();
  const deleteEvidence = useApp((s) => s.deleteEvidence);
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('All');
  const latest = selectLatestSummary(state);
  const upcoming = selectUpcomingVisit(state);
  const openStep = state.followUps.filter((f) => !f.outcome).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const field = (k: string) => {
    const f = latest?.fields.find((x) => x.key === k);
    return f && f.clinical !== 'Not discussed' ? f.clinical : undefined;
  };
  const items = useMemo(
    () => [...state.evidence].sort((a, b) => b.date.localeCompare(a.date)).map((e) => ({ e, ...evidenceTag(e) })).filter((x) => filter === 'All' || x.filter.includes(filter)),
    [state.evidence, filter],
  );
  const printNow = params.get('print') === '1';
  useEffect(() => {
    if (!printNow) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [printNow]);

  const often = [field('frequency'), field('severity')].filter(Boolean).join(' · ');
  const tried = field('tried') ?? (state.medications.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ''}`).join('; ') || undefined);

  return (
    <Shell header={{ kind: 'brand' }} tabs wide>
      <div className="visit-page">
        <nav className="crumbs no-print" aria-label="Breadcrumb"><Link to="/visits">Visits</Link> <span aria-hidden="true">›</span> <span>My history</span></nav>
        <div className="page-head">
          <h1>My history</h1>
          <div className="btn-row no-print">
            <Link to={upcoming ? `/visits/${upcoming.id}/before/import` : '/visits/import'} className="btn btn--outline">Import notes</Link>
            <button className="btn btn--primary" onClick={() => window.print()}>Export PDF</button>
          </div>
        </div>
        <div className="history-grid">
          <section className="panel panel--accent" aria-labelledby="ds">
            <span id="ds" className="eyebrow-soft">Doctor summary</span>
            {latest ? (
              <div className="kv">
                {field('symptoms') && <span><strong>Main concerns:</strong> {field('symptoms')}</span>}
                {field('onset') && <span><strong>How long:</strong> {field('onset')}</span>}
                {often && <span><strong>How often / how bad:</strong> {often}</span>}
                {tried && <span><strong>Tried:</strong> {tried}</span>}
                <span><strong>Open next step:</strong> {openStep ? `${openStep.step.toLowerCase()} · due ${formatShort(openStep.dueDate)}` : <span className="muted">none open</span>}</span>
              </div>
            ) : (
              <>
                <p className="muted" style={{ margin: 0 }}>Builds itself once you name how you feel before a visit.</p>
                {upcoming && <Link to={`/visits/${upcoming.id}/before`} className="btn btn--sm" style={{ alignSelf: 'flex-start' }}>Name how I feel</Link>}
              </>
            )}
            <p className="small muted" style={{ marginTop: 'auto' }}>Patient-reported. Evidence builds across visits.</p>
          </section>

          <section className="panel" aria-labelledby="tl">
            <div className="row row--between row--wrap">
              <span id="tl" className="eyebrow-soft">Timeline</span>
              <div className="chips no-print" role="group" aria-label="Filter timeline">
                {(['All', 'Stories', 'Visits', 'Meds'] as Filter[]).map((f) => <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>{f}</Chip>)}
              </div>
            </div>
            {items.length === 0 && <p className="muted" style={{ margin: 0 }}>Nothing here yet. Stories, visits and medication changes show up with their dates.</p>}
            <ul className="found found--timeline">
              {items.map(({ e, tag }) => (
                <li key={e.id}>
                  <span style={{ flex: 1 }}><strong>[{formatShort(e.date)}] {tag === 'Your words' ? 'Story' : tag === 'Import' ? 'Imported' : e.title}:</strong> {e.detail}</span>
                  <span className="tag">{tag}</span>
                  <ConfirmButton className="icon-btn no-print" ariaLabel={`Delete ${e.title} from ${formatShort(e.date)}`} question="Delete this entry for good?" confirmLabel="Delete" onConfirm={() => deleteEvidence(e.id)}>
                    <IconTrash width={14} height={14} />
                  </ConfirmButton>
                </li>
              ))}
            </ul>
            <Link to="/case/add" className="link-btn no-print" style={{ alignSelf: 'flex-start' }}>+ Add a date (medication change, symptom…)</Link>
          </section>
        </div>
      </div>
    </Shell>
  );
}

/** Import from My history when no visit is coming up. */
export function ImportStandalone() {
  return (
    <Shell header={{ kind: 'brand' }} tabs wide>
      <div className="visit-page">
        <nav className="crumbs" aria-label="Breadcrumb"><Link to="/visits/history">My history</Link> <span aria-hidden="true">›</span> <span>Import notes</span></nav>
        <ImportView />
      </div>
    </Shell>
  );
}

/* ---------- Share links (used by B6 and Settings) ---------- */

export function linkUrl(l: ShareLink) {
  return `${window.location.origin}/shared/${l.token}`;
}

export function ShareLinkRow({ link, onCopied }: { link: ShareLink; onCopied?: (m: string) => void }) {
  const revoke = useApp((s) => s.revokeShareLink);
  const expires = new Date(link.expiresAt);
  return (
    <div className="card card--soft">
      <span className="card__title">Brief · made {formatDate(link.createdAt.slice(0, 10))}</span>
      <span className="small muted">Expires {expires.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at {expires.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
      <div className="row row--wrap">
        <button
          className="btn btn--sm"
          onClick={async () => {
            try { await navigator.clipboard.writeText(linkUrl(link)); onCopied?.('Copied'); } catch { onCopied?.('Couldn’t copy on this device'); }
          }}
        >
          Copy link
        </button>
        <Link to={`/shared/${link.token}`} className="btn btn--sm">Preview</Link>
        <ConfirmButton className="btn btn--sm btn--outline-danger" question="Stop sharing? The link stops working right away." confirmLabel="Stop sharing" onConfirm={() => { revoke(link.id); onCopied?.('Stopped sharing'); }}>
          Stop sharing
        </ConfirmButton>
      </div>
    </div>
  );
}
