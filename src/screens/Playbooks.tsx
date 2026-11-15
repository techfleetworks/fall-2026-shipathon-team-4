import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { IconTrash } from '../components/Icons';
import { Chip, ChipSelect, ConfirmButton, Disclaimer, useToast } from '../components/ui';
import { CONDITIONS, PLAYBOOKS, SITUATIONS, type Playbook, type PlaybookArt } from '../data/playbooks';
import { SCRIPTS } from '../data/scripts';
import { formatShort, todayISO } from '../lib/dates';
import { draftPlaybook, MAKE_SITUATIONS, type MakeSituation, type PlaybookRequest } from '../lib/playbook';
import { hasCrisisLanguage } from '../lib/safety';
import { selectLatestSummary, selectUpcomingVisit, useApp } from '../lib/store';
import type { MyPlaybook, SharedTip, Visit } from '../lib/types';
import { ScriptCard } from './Scripts';

/* ---------- shared bits ---------- */

/** Playbooks header + in-page tabs: AI-generated playbooks · Others' playbooks (site map). */
function PlaybooksLayout({ tab, children }: { tab: 'mine' | 'others'; children: ReactNode }) {
  return (
    <Shell header={{ kind: 'brand' }} tabs>
      <div className="pb-page">
        <h1>Playbooks</h1>
        <nav className="tabs tabs--links" aria-label="Playbooks">
          <Link to="/playbooks" aria-current={tab === 'mine' ? 'page' : undefined}>AI-generated playbooks</Link>
          <Link to="/playbooks/others" aria-current={tab === 'others' ? 'page' : undefined}>Others’ playbooks</Link>
        </nav>
        {children}
      </div>
    </Shell>
  );
}

/** Detail pages: brand header + breadcrumb, wide layout. */
function PlaybookPage({ crumbs, children }: { crumbs: { label: string; to?: string }[]; children: ReactNode }) {
  return (
    <Shell header={{ kind: 'brand' }} tabs>
      <div className="pb-page">
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <Fragment key={c.label}>
              {i > 0 && ' › '}
              {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            </Fragment>
          ))}
        </nav>
        {children}
      </div>
    </Shell>
  );
}

const visitLabel = (v: Visit) => `${formatShort(v.date)}${v.clinician ? ` · ${v.clinician}` : ''}`;
const helpedLine = (p: Playbook, long = true) => `${p.helped.pct}% of ${p.helped.of}${long ? ' who tried this' : ''} said it helped`;

/** Placeholder illustration for a playbook card until photos are chosen. Decorative. */
function PlaybookArtwork({ art }: { art: PlaybookArt }) {
  const ink = '#1e2a44';
  const teal = '#1f6b63';
  return (
    <div className={`pb-art pb-art--${art}`} aria-hidden="true">
      <svg viewBox="0 0 200 90">
        {art === 'log' && (<>
          <rect x="62" y="10" width="76" height="70" rx="8" fill="#fff" stroke={ink} strokeWidth="2" />
          {[26, 40, 54, 68].map((y, i) => <rect key={y} x="74" y={y - 4} width={44 - i * 6} height="6" rx="3" fill={i === 0 ? teal : '#e9d3a6'} />)}
        </>)}
        {art === 'opinion' && (<>
          <rect x="40" y="16" width="70" height="40" rx="10" fill="#fff" stroke={ink} strokeWidth="2" />
          <rect x="92" y="38" width="70" height="40" rx="10" fill={teal} />
          <rect x="52" y="30" width="40" height="6" rx="3" fill="#e9d3a6" />
          <rect x="104" y="52" width="44" height="6" rx="3" fill="#bfe0da" />
        </>)}
        {art === 'meds' && (<>
          <rect x="78" y="22" width="44" height="56" rx="8" fill="#f2b84b" />
          <rect x="72" y="12" width="56" height="14" rx="4" fill="#fff" stroke={ink} strokeWidth="2" />
          <rect x="86" y="40" width="28" height="22" rx="3" fill="#fff" />
          <ellipse cx="150" cy="70" rx="10" ry="6" fill="#fff" stroke={ink} strokeWidth="1.5" />
          <ellipse cx="50" cy="68" rx="10" ry="6" fill="#fff" stroke={ink} strokeWidth="1.5" />
        </>)}
        {art === 'chart' && (<>
          <rect x="66" y="10" width="68" height="72" rx="8" fill="#fff" stroke={ink} strokeWidth="2" />
          <path d="M80 34 l8 8 l16 -16" fill="none" stroke={teal} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="80" y="54" width="40" height="6" rx="3" fill="#e9d3a6" />
          <rect x="80" y="66" width="30" height="6" rx="3" fill="#e9d3a6" />
        </>)}
        {art === 'talk' && (<>
          <circle cx="72" cy="46" r="22" fill={ink} />
          <rect x="66" y="32" width="12" height="20" rx="6" fill="#fff" />
          <rect x="104" y="22" width="64" height="40" rx="10" fill="#fff" stroke={ink} strokeWidth="2" />
          <rect x="116" y="36" width="40" height="6" rx="3" fill="#e9d3a6" />
        </>)}
      </svg>
    </div>
  );
}

/* ---------- PB1 · AI-generated: make one + saved ---------- */

interface MakeState { situation?: MakeSituation; basedOn?: string }

export function MyPlaybooks() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state ?? {}) as MakeState;
  const visits = useApp((s) => s.visits);
  const myPlaybooks = useApp((s) => s.myPlaybooks) ?? [];
  const savedScripts = useApp((s) => s.savedScripts);
  const upcoming = useMemo(
    () => visits.filter((v) => !v.checkIn && v.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date)),
    [visits],
  );
  const next = useApp((s) => selectUpcomingVisit(s));
  const [worry, setWorry] = useState('');
  const [situation, setSituation] = useState<MakeSituation | undefined>(prefill.situation ?? 'Being brushed off');
  const [visitId, setVisitId] = useState(next?.id ?? upcoming[0]?.id ?? '');
  const basedOn = PLAYBOOKS.find((p) => p.id === prefill.basedOn);
  const list = [...myPlaybooks].reverse();

  const make = () => {
    // What someone types here is never stored; crisis language goes straight to help.
    if (hasCrisisLanguage(worry)) return navigate('/help/now', { replace: true });
    const req: PlaybookRequest = { worry: worry.trim() || undefined, situation, visitId: visitId || undefined, basedOn: basedOn?.id };
    navigate('/playbooks/new', { state: req });
  };

  return (
    <PlaybooksLayout tab="mine">
      <div className="pb-grid">
        <section className="panel panel--accent pb-make" aria-labelledby="make-title">
          <h2 id="make-title" className="panel-title">Make a playbook for my visit</h2>
          {basedOn && <p className="small muted">Based on “{basedOn.title}”, with your own details.</p>}
          <div className="field">
            <label htmlFor="worry">What are you worried might happen?</label>
            <textarea id="worry" className="textarea" rows={3} placeholder="e.g., they’ll say it’s just stress again."
              value={worry} onChange={(e) => setWorry(e.target.value)} />
          </div>
          <div className="chips--soft">
            <ChipSelect label="Situation" options={[...MAKE_SITUATIONS]} value={situation} onChange={(v) => setSituation(v as MakeSituation | undefined)} />
          </div>
          <div className="field">
            <label htmlFor="for-visit">For which visit?</label>
            <select id="for-visit" className="select input" value={visitId} onChange={(e) => setVisitId(e.target.value)}>
              {upcoming.map((v) => <option key={v.id} value={v.id}>{visitLabel(v)}</option>)}
              <option value="">{upcoming.length ? 'Not for a specific visit' : 'No upcoming visit yet'}</option>
            </select>
          </div>
          <button className="btn btn--primary btn--lg" style={{ alignSelf: 'flex-start' }} onClick={make}>Make my playbook</button>
        </section>

        <div className="pb-side">
          <section className="panel" aria-labelledby="saved-title">
            <h2 id="saved-title" className="eyebrow-soft">Saved playbooks</h2>
            {list.length === 0 ? (
              <p className="small muted">None yet. Playbooks you make are saved here.</p>
            ) : (
              <ul className="pb-saved">
                {list.map((p) => <SavedRow key={p.id} p={p} visits={visits} />)}
              </ul>
            )}
          </section>
          {savedScripts.length > 0 && (
            <section className="panel" aria-labelledby="scripts-title">
              <h2 id="scripts-title" className="eyebrow-soft">Saved scripts</h2>
              <ul className="pb-saved">
                {SCRIPTS.filter((s) => savedScripts.includes(s.id)).map((s) => (
                  <li key={s.id}>
                    <span className="pb-saved__title">{s.situation}</span>
                    <Link to={`/scripts/${s.id}/practice`} className="pb-saved__action">Practice</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Link to="/scripts" className="link-btn" style={{ alignSelf: 'flex-start' }}>Browse the script library</Link>
        </div>
      </div>
    </PlaybooksLayout>
  );
}

function SavedRow({ p, visits }: { p: MyPlaybook; visits: Visit[] }) {
  const visit = p.visitId ? visits.find((v) => v.id === p.visitId) : undefined;
  return (
    <li>
      <Link to={`/playbooks/mine/${p.id}`} className="pb-saved__main">
        <span className="pb-saved__title">{p.title}</span>
        <span className="small muted">{visit ? `On ${formatShort(visit.date)} talking points` : `Saved ${formatShort(p.createdAt.slice(0, 10))}`}</span>
      </Link>
      <Link to={`/playbooks/mine/${p.id}/practice`} className="pb-saved__action">Practice</Link>
    </li>
  );
}

/* ---------- Draft → save ---------- */
export function NewPlaybook() {
  const state = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const req = (location.state ?? {}) as PlaybookRequest;
  const draft = useMemo(() => draftPlaybook(state, req), [state, req]);
  const latest = selectLatestSummary(state);
  const visit = draft.visitId ? state.visits.find((v) => v.id === draft.visitId) : undefined;

  const save = () => {
    const id = state.savePlaybook(draft);
    // Saved playbooks attach to that visit's talking points ("Playbooks to bring").
    if (visit) state.updateVisit(visit.id, { scripts: [...new Set([...(visit.scripts ?? []), ...draft.scriptIds])] });
    navigate(`/playbooks/mine/${id}`, { replace: true });
  };

  return (
    <PlaybookPage crumbs={[{ label: 'Playbooks', to: '/playbooks' }, { label: 'AI-generated', to: '/playbooks' }, { label: 'Draft' }]}>
      <div className="pb-narrow">
        <span className="eyebrow-soft">Draft{visit ? ` · for ${visitLabel(visit)}` : ''}</span>
        <h1>{draft.title}</h1>
        {!latest && (
          <div className="card card--muted">
            <p className="small">This works best after you tell your story. For now it uses general scripts.</p>
            <Link to="/story" className="btn btn--sm" style={{ alignSelf: 'flex-start' }}>Tell my story first</Link>
          </div>
        )}
        <PlaybookBody p={draft} />
        <button className="btn btn--primary btn--block" onClick={save}>Save playbook</button>
        <p className="small muted">
          Built from what you’ve saved.{visit ? ' Saving adds these to that visit’s talking points.' : ''} Change your priorities in your <Link to="/brief">visit brief</Link>.
        </p>
      </div>
    </PlaybookPage>
  );
}

type PlaybookLike = ReturnType<typeof draftPlaybook>;

function PlaybookBody({ p }: { p: PlaybookLike }) {
  const peer = PLAYBOOKS.find((x) => x.id === p.peerPlaybookId);
  return (
    <>
      <section className="card">
        <span className="card__label">Start with</span>
        <div className="quote"><p>“{p.opening}”</p></div>
      </section>
      {p.priorities.length > 0 && (
        <section className="card">
          <span className="card__label">Top priorities</span>
          <ol className="list">{p.priorities.map((x) => <li key={x}>{x}</li>)}</ol>
        </section>
      )}
      <h2 className="section-label">If you’re brushed off</h2>
      {p.scriptIds.map((id) => {
        const s = SCRIPTS.find((x) => x.id === id);
        return s ? <ScriptCard key={id} script={s} /> : null;
      })}
      <section className="card card--soft">
        <span className="card__label">What I’m asking for</span>
        <p>{p.askingFor.length ? p.askingFor.join(' · ') : 'To agree a clear next step before I leave.'}</p>
      </section>
      {peer && (
        <Link to={`/playbooks/others/${peer.id}`} className="card card--link card--soft">
          <span className="card__label">From others in a similar spot</span>
          <span className="card__title">“{peer.title}”</span>
        </Link>
      )}
      <Disclaimer />
    </>
  );
}

export function MyPlaybookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const p = useApp((s) => (s.myPlaybooks ?? []).find((x) => x.id === id));
  const deletePlaybook = useApp((s) => s.deletePlaybook);
  if (!p) return <Navigate to="/playbooks" replace />;
  return (
    <PlaybookPage crumbs={[{ label: 'Playbooks', to: '/playbooks' }, { label: 'AI-generated', to: '/playbooks' }, { label: p.title }]}>
      <div className="pb-narrow">
        <h1>{p.title}</h1>
        <Link to={`/playbooks/mine/${p.id}/practice`} className="btn btn--primary btn--block">Practice it</Link>
        <PlaybookBody p={p} />
        <ConfirmButton
          className="btn btn--block btn--outline-danger"
          question="Delete this playbook?"
          confirmLabel="Delete"
          onConfirm={() => { deletePlaybook(p.id); navigate('/playbooks', { replace: true }); }}
        >
          <IconTrash width={16} height={16} /> Delete playbook
        </ConfirmButton>
      </div>
    </PlaybookPage>
  );
}

/* ---------- PB2 · Practice it: a respectful practice dialogue, one step at a time ---------- */

const GENERIC_WHY = 'Saying it out loud before the visit makes the words come more easily in the room.';

export function PracticePlaybook() {
  const { id } = useParams();
  const navigate = useNavigate();
  const p = useApp((s) => (s.myPlaybooks ?? []).find((x) => x.id === id));
  const [i, setI] = useState(0);
  const [tone, setTone] = useState<'Calm' | 'Firmer'>('Calm');
  const [typing, setTyping] = useState(false);
  const [own, setOwn] = useState('');
  if (!p) return <Navigate to="/playbooks" replace />;

  const steps = [
    { doctor: 'So, what brings you in today?', calm: p.opening, firmer: p.opening, why: 'Leading with what matters most means it gets time, even if the visit runs short.' },
    ...p.scriptIds
      .map((sid) => SCRIPTS.find((s) => s.id === sid))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => ({ doctor: s.doctor ?? 'Is there anything else?', calm: s.text, firmer: s.firmer ?? s.text, why: s.why ?? GENERIC_WHY })),
  ];
  const done = i >= steps.length;
  const step = steps[Math.min(i, steps.length - 1)];

  const advance = () => {
    // Typed practice text is never stored; crisis language goes straight to help.
    if (hasCrisisLanguage(own)) return navigate('/help/now', { replace: true });
    setOwn('');
    setTyping(false);
    setI(i + 1);
  };

  return (
    <PlaybookPage crumbs={[{ label: 'Playbooks', to: '/playbooks' }, { label: 'AI-generated', to: '/playbooks' }, { label: p.title, to: `/playbooks/mine/${p.id}` }]}>
      <div className="pb-grid pb-grid--practice">
        <section className="panel pb-practice" aria-live="polite">
          <span className="eyebrow-soft">{done ? 'Practice · All done' : `Practice · Step ${i + 1} of ${steps.length}`}</span>
          {done ? (
            <div className="stack-sm">
              <h1 className="panel-title">You’re ready.</h1>
              <p>Saying it before the visit makes it easier in the room.</p>
              <div className="btn-row">
                <button className="btn btn--outline" onClick={() => setI(0)}>Practice again</button>
                <Link to={`/playbooks/mine/${p.id}`} className="btn btn--primary">Back to my playbook</Link>
              </div>
            </div>
          ) : (
            <>
              <div className="pb-chat">
                <p className="pb-bubble pb-bubble--doctor"><strong>Doctor (practice):</strong> “{step.doctor}”</p>
                <p className="pb-bubble pb-bubble--you"><strong>You could say:</strong> “<Highlighted text={tone === 'Calm' ? step.calm : step.firmer} />”</p>
                {typing && (
                  <div className="field pb-own">
                    <label htmlFor="own">Your own version</label>
                    <textarea id="own" className="textarea" rows={3} value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Put it in your own words." />
                    <span className="small muted">Not saved — this is just for practice.</span>
                  </div>
                )}
              </div>
              <div className="pb-say">
                <button className="pb-say__btn" onClick={advance}>{typing ? 'Next' : 'Say it'}</button>
                <p className="muted">
                  Say it out loud, or{' '}
                  <button type="button" className="link-btn link-btn--inline" aria-expanded={typing} aria-controls="own" onClick={() => setTyping((t) => !t)}>
                    type your own version
                  </button>
                </p>
              </div>
            </>
          )}
        </section>

        <aside className="panel pb-why">
          <span className="eyebrow-soft">Why this works</span>
          <p>{step.why}</p>
          <span className="eyebrow-soft">Tone</span>
          <div className="chips--soft">
            <div className="chips" role="group" aria-label="Tone">
              {(['Calm', 'Firmer'] as const).map((t) => <Chip key={t} selected={tone === t} onClick={() => setTone(t)}>{t}</Chip>)}
            </div>
          </div>
        </aside>
      </div>
    </PlaybookPage>
  );
}

function Highlighted({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[^\]]+\])/g).map((part, k) =>
        part.startsWith('[') ? <span key={k} style={{ color: 'var(--primary)', fontWeight: 600 }}>{part}</span> : <Fragment key={k}>{part}</Fragment>,
      )}
    </>
  );
}

/* ---------- PB3 · Others' playbooks: browse ---------- */

const QUICK_CONDITION = 'Depression';

export function OthersPlaybooks() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [more, setMore] = useState(false);
  const condition = params.get('condition') ?? undefined;
  const situation = params.get('situation') ?? undefined;
  const setFilter = (key: 'condition' | 'situation', v?: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(key, v); else next.delete(key);
    setParams(next, { replace: true });
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PLAYBOOKS.filter((p) => {
      if (condition && !p.conditions.some((c) => (condition === QUICK_CONDITION ? c.startsWith('Depression') || c.includes('depression') : c === condition))) return false;
      if (situation && !p.situations.includes(situation as Playbook['situations'][number])) return false;
      if (q && !(p.title + ' ' + p.steps.join(' ') + ' ' + p.trySaying + ' ' + p.conditions.join(' ') + ' ' + p.situations.join(' ')).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, condition, situation]);

  return (
    <PlaybooksLayout tab="others">
      <div className="pb-filterbar">
        <label htmlFor="pb-q" className="sr-only">Search playbooks</label>
        <input id="pb-q" className="input search" type="search" placeholder="Search playbooks" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="chips--soft pb-quick">
          <div className="chips">
            <Chip selected={condition === QUICK_CONDITION} onClick={() => setFilter('condition', condition === QUICK_CONDITION ? undefined : QUICK_CONDITION)}>Depression</Chip>
            <button type="button" className="chip" aria-expanded={more} aria-controls="pb-filters" onClick={() => setMore((m) => !m)}>
              More <span aria-hidden="true">{more ? '▴' : '▾'}</span>
            </button>
          </div>
        </div>
      </div>

      {more && (
        <section id="pb-filters" className="panel pb-filters" aria-label="Filters">
          <span className="eyebrow-soft">Conditions</span>
          <div className="chips--soft">
            <ChipSelect label="Conditions" options={[...CONDITIONS]} value={condition} onChange={(v) => setFilter('condition', v)} />
          </div>
          <span className="eyebrow-soft">Situations</span>
          <div className="chips--soft">
            <ChipSelect label="Situations" options={[...SITUATIONS]} value={situation} onChange={(v) => setFilter('situation', v)} />
          </div>
        </section>
      )}

      <p className="muted small">
        Approaches other patients say worked for them. Community-shared, not medical advice.
        <br />Examples and numbers are synthetic for now — not real people.
      </p>

      {list.length === 0 ? (
        <p className="muted">No playbooks match. Try another word or clear a filter.</p>
      ) : (
        <div className="pb-cards">
          {list.map((p) => (
            <Link key={p.id} to={`/playbooks/others/${p.id}`} className="pb-card">
              <PlaybookArtwork art={p.art} />
              <span className="pb-card__title">“{p.title}”</span>
              <span className="muted">{helpedLine(p)}</span>
            </Link>
          ))}
        </div>
      )}
    </PlaybooksLayout>
  );
}

/* ---------- PB4 · Playbook detail + did it help? ---------- */

export function OthersPlaybookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const p = PLAYBOOKS.find((x) => x.id === id);
  const visit = useApp((s) => selectUpcomingVisit(s));
  const updateVisit = useApp((s) => s.updateVisit);
  const addTip = useApp((s) => s.addTip);
  const myRating = useApp((s) => [...s.sharedTips].reverse().find((t) => t.playbookId === id)?.rating);
  const [toast, showToast] = useToast();
  if (!p) return <Navigate to="/playbooks/others" replace />;

  const added = !!visit && p.scriptIds.every((sid) => visit.scripts?.includes(sid));
  const addToVisit = () => {
    if (!visit) return navigate('/visits/new');
    updateVisit(visit.id, { scripts: [...new Set([...(visit.scripts ?? []), ...p.scriptIds])] });
    showToast(`Added to your ${formatShort(visit.date)} visit`);
  };
  const rate = (rating: SharedTip['rating']) => {
    addTip({ text: '', rating, playbookId: p.id });
    showToast('Thanks — saved on this device');
  };
  const more = PLAYBOOKS
    .filter((x) => x.id !== p.id)
    .map((x) => ({ x, score: x.situations.filter((s) => p.situations.includes(s)).length + x.conditions.filter((c) => p.conditions.includes(c)).length / 10 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ x }) => x);

  return (
    <PlaybookPage crumbs={[{ label: 'Playbooks', to: '/playbooks' }, { label: 'Others’ playbooks', to: '/playbooks/others' }]}>
      <div className="pb-grid pb-grid--detail">
        <div className="pb-detail">
          <h1>“{p.title}”</h1>
          <p className="muted">{p.conditions[0].replace(/ \(.*\)$/, '')} · {p.setting} · shared anonymously</p>
          <section className="panel">
            <span className="eyebrow-soft">What they did</span>
            <ol className="pb-steps">{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </section>
          <section className="panel panel--muted">
            <span className="eyebrow-soft">Try saying</span>
            <p>“{p.trySaying}”</p>
          </section>
          <p className="small muted">Synthetic example — not a real person. Not medical advice.</p>
        </div>

        <aside className="panel pb-aside">
          <p>{helpedLine(p)}</p>
          <button className="btn btn--primary btn--lg btn--block" onClick={addToVisit} disabled={added}>
            {added ? 'Added to my next visit' : visit ? 'Add to my next visit' : 'Add a visit first'}
          </button>
          <Link to="/playbooks" state={{ situation: toMakeSituation(p), basedOn: p.id } satisfies MakeState} className="btn btn--outline btn--lg btn--block">
            Make an AI version for me
          </Link>
          <hr />
          <span className="eyebrow-soft">Did this help?</span>
          <div className="chips--soft">
            <ChipSelect label="Did this help" options={['Yes', 'No']} value={myRating === 'A little' ? undefined : myRating} onChange={(v) => v && rate(v as SharedTip['rating'])} />
          </div>
          <hr />
          <span className="eyebrow-soft">More like this</span>
          <ul className="pb-more">
            {more.map((x) => (
              <li key={x.id}>
                <Link to={`/playbooks/others/${x.id}`}>“{x.title}”</Link>
                <span className="small muted">{helpedLine(x, false)}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      {toast}
    </PlaybookPage>
  );
}

function toMakeSituation(p: Playbook): MakeSituation | undefined {
  return p.situations.find((s): s is MakeSituation => (MAKE_SITUATIONS as readonly string[]).includes(s));
}

/* ---------- Did it help? (rate) — also "Share what helped" after a visit ---------- */
export function RatePlaybook() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const addTip = useApp((s) => s.addTip);
  const anonymousRatings = useApp((s) => !!s.profile?.consent?.anonymousRatings);
  const [playbookId, setPlaybookId] = useState<string | undefined>(params.get('p') ?? undefined);
  const [rating, setRating] = useState<SharedTip['rating']>();
  const [text, setText] = useState('');
  const [toast, showToast] = useToast();
  const playbook = PLAYBOOKS.find((p) => p.id === playbookId);

  const save = () => {
    if (hasCrisisLanguage(text)) {
      navigate('/help/now', { replace: true });
      return;
    }
    addTip({ text: text.trim(), rating, playbookId });
    showToast('Saved — thank you');
    setTimeout(() => navigate(playbookId ? `/playbooks/others/${playbookId}` : '/playbooks/others'), 700);
  };

  return (
    <Shell header={{ kind: 'sub', title: 'Did it help?', back: 'history' }}>
      <h1>Did it help?</h1>
      <p className="lead">Your rating helps the next person walk in prepared.</p>
      <div className="field">
        <label htmlFor="pb">Which playbook?</label>
        <select id="pb" className="select input" value={playbookId ?? ''} onChange={(e) => setPlaybookId(e.target.value || undefined)}>
          <option value="">A script or something else</option>
          {PLAYBOOKS.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>
      <div className="field">
        <span className="label">{playbook ? 'Did this playbook help?' : 'Did it help?'}</span>
        <ChipSelect label="Did it help" options={['Yes', 'A little', 'No']} value={rating} onChange={(v) => setRating(v as SharedTip['rating'])} />
      </div>
      <div className="field">
        <label htmlFor="tip">What would you tell someone in your shoes? <span className="muted">(optional)</span></label>
        <textarea id="tip" className="textarea" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Leading with the date the side effect started made them listen." />
      </div>
      <div className="card card--muted">
        <p className="small">
          Leave out names, places and anything that could identify you or your doctor. In this version your rating stays on this device.
          {anonymousRatings
            ? ' You’ve allowed anonymous ratings, so it will be shared without your name once sharing is live.'
            : ' Sharing with others is off. You can turn on anonymous ratings in Settings → Privacy and data.'}
        </p>
      </div>
      <button className="btn btn--primary btn--block" disabled={!rating && !text.trim()} onClick={save}>Save my rating</button>
      <Link to="/home" className="btn btn--block">Skip</Link>
      {toast}
    </Shell>
  );
}
