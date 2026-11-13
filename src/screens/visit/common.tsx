import { useEffect, useRef, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { formatShort, todayISO } from '../../lib/dates';
import { selectLatestSummary, selectUpcomingVisit, selectVisitNeedingCheckIn, useApp, type AppData } from '../../lib/store';
import type { Visit } from '../../lib/types';

export type Stage = 'before' | 'at' | 'after';

export function visitTitle(v: Visit) {
  return `${formatShort(v.date)} · ${v.clinician || v.specialty || 'Visit'}`;
}

export function formatTime(hhmm?: string) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Loads the visit in the URL, or sends the user back to Visits. */
export function useVisitParam(): Visit | null {
  const { id } = useParams();
  return useApp((s) => s.visits.find((v) => v.id === id)) ?? null;
}

export function beforeSteps(s: AppData, v: Visit) {
  const latest = selectLatestSummary(s);
  return [
    { slug: '', label: 'Name how I feel', done: !!latest },
    { slug: 'summary', label: 'Doctor summary', done: !!latest },
    { slug: 'brief', label: 'Talking points', done: v.priorities.length > 0 },
    { slug: 'today', label: 'Prep', done: !!v.prep && (v.prep.checks.length > 0 || prepFeelings(v.prep).length > 0) },
    { slug: 'share', label: 'Share', done: !!v.shared },
  ];
}

export function afterSteps(s: AppData, v: Visit) {
  return [
    { slug: '', label: 'Recap', done: !!v.recap?.doctorSaid.length || !!v.notes?.trim() },
    { slug: 'check-in', label: 'Check-in', done: !!v.checkIn },
    { slug: 'next-steps', label: 'Next steps', done: s.followUps.some((f) => f.visitId === v.id) },
  ];
}

/** The stage that makes sense right now for this visit. */
export function defaultStage(v: Visit): Stage {
  const today = todayISO();
  if (v.date === today) return 'at';
  return v.date < today ? 'after' : 'before';
}

interface LayoutProps {
  visit: Visit;
  stage: Stage;
  /** Current left-nav step slug ('' = first). Omit to hide the step list. */
  step?: string;
  crumbExtra?: string;
  children: ReactNode;
}

/** Visits › date · doctor, then Before / At / After tabs, then the step list + content. */
export function VisitLayout({ visit, stage, step, crumbExtra, children }: LayoutProps) {
  const state = useApp();
  const steps = stage === 'before' ? beforeSteps(state, visit) : stage === 'after' ? afterSteps(state, visit) : null;
  const base = `/visits/${visit.id}`;
  return (
    <Shell header={{ kind: 'brand' }} tabs wide>
      <div className="visit-page">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/visits">Visits</Link> <span aria-hidden="true">›</span> <span>{visitTitle(visit)}{crumbExtra ? ` · ${crumbExtra}` : ''}</span>
        </nav>
        <nav className="tabs tabs--links tabs--stage" aria-label="Visit stage">
          <Link to={`${base}/before`} aria-current={stage === 'before' ? 'page' : undefined}>Before the visit</Link>
          <Link to={`${base}/at`} aria-current={stage === 'at' ? 'page' : undefined}>At the visit</Link>
          <Link to={`${base}/after`} aria-current={stage === 'after' ? 'page' : undefined}>After the visit</Link>
        </nav>
        {steps && step !== undefined ? (
          <div className="visit-grid">
            <ol className="steps-nav" aria-label="Steps">
              {steps.map((s, i) => (
                <li key={s.slug}>
                  <Link to={`${base}/${stage}${s.slug ? `/${s.slug}` : ''}`} aria-current={step === s.slug ? 'step' : undefined}>
                    {i + 1} · {s.label}{s.done && <span aria-label=" (done)"> ✓</span>}
                  </Link>
                </li>
              ))}
            </ol>
            <div className="visit-content">{children}</div>
          </div>
        ) : (
          children
        )}
      </div>
    </Shell>
  );
}

/** Dialog over a dark backdrop (V2, B6, A2). Esc and the backdrop close it. */
export function Modal({ title, onClose, children, labelledBy = 'modal-title' }: { title: string; onClose: () => void; children: ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, button, select, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <h2 id={labelledBy}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Old links (/brief, /today, /story…) land on the right step of the right visit. */
export function ToVisit({ path, prefer = 'upcoming' }: { path: string; prefer?: 'upcoming' | 'checkin' }) {
  const state = useApp();
  const upcoming = selectUpcomingVisit(state);
  const past = selectVisitNeedingCheckIn(state);
  const lastPast = [...state.visits].filter((v) => v.date <= todayISO()).sort((a, b) => b.date.localeCompare(a.date))[0];
  const v = prefer === 'checkin' ? past ?? lastPast ?? upcoming : upcoming ?? past;
  return <Navigate to={v ? `/visits/${v.id}/${path}` : '/visits/new'} replace />;
}

export function RedirectVisitPath({ to }: { to: (id: string) => string }) {
  const { id } = useParams();
  return <Navigate to={id ? to(id) : '/visits'} replace />;
}

export function VisitIndex() {
  const visit = useVisitParam();
  if (!visit) return <Navigate to="/visits" replace />;
  return <Navigate to={`/visits/${visit.id}/${defaultStage(visit)}`} replace />;
}

/** Feelings picked on the Prep step. Older visits saved a single `feeling`; it reads as a one-item list. */
export function prepFeelings(prep?: { feelings?: string[]; feeling?: string }): string[] {
  return prep?.feelings ?? (prep?.feeling ? [prep.feeling] : []);
}
