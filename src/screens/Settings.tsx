import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { ChipSelect, ConfirmButton, useToast } from '../components/ui';
import { APP_NAME } from '../lib/brand';
import { todayISO } from '../lib/dates';
import { isLinkActive, useApp } from '../lib/store';
import { ShareLinkRow } from './Visits';

const SECTIONS = [
  { slug: 'profile', label: 'Profile' },
  { slug: 'privacy', label: 'Privacy and data' },
  { slug: 'notifications', label: 'Notifications' },
  { slug: 'install', label: 'Install the app' },
] as const;
type Slug = (typeof SECTIONS)[number]['slug'];

/**
 * S1–S2 + Profile, Notifications, Install. Left menu on desktop.
 * On phones, /settings shows the menu and each section opens on its own.
 */
export function Settings() {
  const { section } = useParams();
  const navigate = useNavigate();
  const signOut = useApp((s) => s.signOut);
  const isIndex = !section;
  if (section && !SECTIONS.some((s) => s.slug === section)) return <Navigate to="/settings" replace />;
  const active: Slug = (section as Slug) ?? 'profile';

  const logOut = () => {
    signOut();
    navigate('/', { replace: true });
  };

  return (
    <Shell header={{ kind: 'brand' }} tabs wide>
      <div className={`settings${isIndex ? ' settings--index' : ''}`}>
        <nav className="settings-nav" aria-label="Settings">
          <h2 className="settings-title">Settings</h2>
          {SECTIONS.map((s) => (
            <NavLink
              key={s.slug}
              to={`/settings/${s.slug}`}
              className={({ isActive }) => (isActive || (isIndex && s.slug === 'profile') ? 'active' : '')}
            >
              {s.label}
            </NavLink>
          ))}
          <div className="settings-nav__sep" />
          <button className="settings-logout" onClick={logOut}>Log out</button>
        </nav>

        <div className="settings-body">
          {!isIndex && <Link to="/settings" className="settings-back">‹ Settings</Link>}
          {active === 'profile' && <ProfileSection />}
          {active === 'privacy' && <PrivacySection />}
          {active === 'notifications' && <NotificationsSection />}
          {active === 'install' && <InstallSection />}
        </div>
      </div>
    </Shell>
  );
}

function Toggle({ label, on, onChange, hint }: { label: ReactNode; on: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  const [id] = useState(() => `t-${Math.random().toString(36).slice(2, 8)}`);
  return (
    <div className="toggle-row">
      <span id={id}>
        {label}
        {hint && <span className="small muted" style={{ display: 'block' }}>{hint}</span>}
      </span>
      <button className="switch" role="switch" aria-checked={on} aria-labelledby={id} onClick={() => onChange(!on)} />
    </div>
  );
}

/* ---------- Profile ---------- */
const TEXT_SIZES: Record<string, number> = { Default: 1, Large: 1.15, 'Extra large': 1.3 };

function ProfileSection() {
  const { profile, updateProfile, textScale, setTextScale, loadDemo } = useApp();
  const navigate = useNavigate();
  const [first, setFirst] = useState(profile?.name ?? '');
  const [last, setLast] = useState(profile?.lastName ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [toast, showToast] = useToast();
  const sizeLabel = Object.entries(TEXT_SIZES).find(([, v]) => v === textScale)?.[0] ?? 'Default';

  return (
    <>
      <h1>Profile</h1>
      <form
        className="pcard"
        onSubmit={(e) => {
          e.preventDefault();
          updateProfile({ name: first.trim(), lastName: last.trim(), email: email.trim().toLowerCase() || undefined });
          showToast('Saved');
        }}
      >
        <div className="grid-2">
          <div className="field">
            <label htmlFor="pf-first">First name</label>
            <input id="pf-first" className="input" autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pf-last">Last name</label>
            <input id="pf-last" className="input" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="pf-email">Email</label>
          <input id="pf-email" type="email" className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button type="submit" className="btn btn--primary" style={{ alignSelf: 'flex-start' }}>Save changes</button>
      </form>

      <section className="pcard">
        <h2>Text size</h2>
        <ChipSelect label="Text size" options={Object.keys(TEXT_SIZES)} value={sizeLabel} onChange={(v) => setTextScale(TEXT_SIZES[v ?? 'Default'])} />
      </section>

      <section className="pcard">
        <h2>Visits</h2>
        <p className="muted">Change your next visit date or look back at past visits.</p>
        <Link to="/visits" className="btn btn--outline" style={{ alignSelf: 'flex-start' }}>Manage visits</Link>
      </section>

      <section className="pcard pcard--muted">
        <h2>Demo</h2>
        <p className="small">Replace your data with Theo’s synthetic example to explore the full flow.</p>
        <div style={{ alignSelf: 'flex-start' }}>
          <ConfirmButton
            className="btn btn--outline btn--sm"
            question="Replace everything on this device with demo data?"
            confirmLabel="Replace with demo"
            onConfirm={() => { loadDemo(); navigate('/home'); }}
          >
            Load demo data
          </ConfirmButton>
        </div>
      </section>
      {toast}
    </>
  );
}

/* ---------- S1 · Privacy and data ---------- */
function PrivacySection() {
  const state = useApp();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [toast, showToast] = useToast();
  const activeLinks = (state.shareLinks ?? []).filter((l) => isLinkActive(l));
  const consent = state.profile?.consent ?? { saveStory: true, makeSummaries: false, anonymousRatings: false };
  const setConsent = (patch: Partial<typeof consent>) => state.updateProfile({ consent: { ...consent, ...patch } });

  const download = () => {
    const { profile, medications, summaries, evidence, visits, followUps, savedScripts, sharedTips, myPlaybooks } = useApp.getState();
    // Never export the password hash.
    const safeProfile = profile ? { ...profile, passwordHash: undefined } : null;
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), app: APP_NAME, profile: safeProfile, medications, summaries, evidence, visits, followUps, savedScripts, sharedTips, myPlaybooks }, null, 2)],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `appointment-ready-data-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <h1>Privacy and data</h1>
      <div className="toggles">
        <Toggle label="Make doctor-ready summaries from my words" on={!!consent.makeSummaries} onChange={(v) => setConsent({ makeSummaries: v })} />
        <Toggle label="Help improve playbooks with anonymous ratings" on={!!consent.anonymousRatings} onChange={(v) => setConsent({ anonymousRatings: v })} />
        <Toggle
          label="Ask before every visit recording"
          on={state.profile?.askBeforeRecording !== false}
          onChange={(v) => state.updateProfile({ askBeforeRecording: v })}
          hint={state.profile?.askBeforeRecording === false ? 'Your doctor will still always be asked.' : undefined}
        />
      </div>

      <section className="pcard">
        <span className="eyebrow">Active share links</span>
        {activeLinks.length === 0 ? (
          <p className="muted">No active share links. When you share your brief by link, it will show here so you can stop sharing anytime.</p>
        ) : (
          activeLinks.map((l) => <ShareLinkRow key={l.id} link={l} onCopied={showToast} />)
        )}
        <Link to="/visits/share" className="btn btn--outline btn--sm" style={{ alignSelf: 'flex-start' }}>Make a share link</Link>
      </section>

      <div className="cols-2">
        <section className="pcard">
          <h2>Download my data</h2>
          <p className="muted">Everything, as a PDF and a file.</p>
          <div className="btn-row">
            <button className="btn btn--outline" onClick={download}>Download file</button>
            <Link className="btn btn--outline" to="/visits/history?print=1">Save as PDF</Link>
          </div>
        </section>
        <section className="pcard" style={{ borderColor: 'var(--danger)' }}>
          <h2>Delete my account</h2>
          <p className="muted">Removes everything for good. Shared links stop working.</p>
          {!confirming ? (
            <button className="btn btn--outline-danger" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirming(true)}>Delete account</button>
          ) : (
            <div className="stack-sm" role="alertdialog" aria-labelledby="del-q">
              <p id="del-q"><strong>Delete your account and everything on this device?</strong> This can’t be undone.</p>
              <div className="btn-row">
                <button className="btn btn--outline" onClick={() => setConfirming(false)}>Cancel</button>
                <button className="btn btn--danger" onClick={() => { state.deleteEverything(); navigate('/', { replace: true }); }}>Delete for good</button>
              </div>
            </div>
          )}
        </section>
      </div>
      {toast}
    </>
  );
}

/* ---------- Notifications ---------- */
const DEFAULT_PREFS = { prepReminders: true, morningOf: true, followUps: true };

function NotificationsSection() {
  const prefs = useApp((s) => s.notifications) ?? DEFAULT_PREFS;
  const setNotifications = useApp((s) => s.setNotifications);
  return (
    <>
      <h1>Notifications</h1>
      <div className="toggles">
        <Toggle label="Remind me to get ready a few days before a visit" on={prefs.prepReminders} onChange={(v) => setNotifications({ prepReminders: v })} />
        <Toggle label="Morning-of checklist on visit day" on={prefs.morningOf} onChange={(v) => setNotifications({ morningOf: v })} />
        <Toggle label="Ask me if a next step happened" on={prefs.followUps} onChange={(v) => setNotifications({ followUps: v })} />
      </div>
      <p className="small muted">Reminders show on your Home screen. Phone notifications are coming with accounts.</p>
    </>
  );
}

/* ---------- Install the app ---------- */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function InstallSection() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(
    () => (window as unknown as { __installPrompt?: InstallPromptEvent }).__installPrompt ?? null,
  );
  const [installed, setInstalled] = useState(
    () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true,
  );
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPromptEvent(e as InstallPromptEvent); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setPromptEvent(null);
  };

  return (
    <>
      <h1>Install the app</h1>
      <p className="pub-sub">Add {APP_NAME} to your home screen so it opens like an app and works offline.</p>
      {installed ? (
        <section className="pcard"><p><strong>It’s installed.</strong> You’re using the app version right now.</p></section>
      ) : promptEvent ? (
        <section className="pcard">
          <p>One tap and it’s on your home screen.</p>
          <button className="btn btn--primary" style={{ alignSelf: 'flex-start' }} onClick={install}>Install {APP_NAME}</button>
        </section>
      ) : (
        <div className="cols-2">
          <section className={`pcard${isIOS ? ' pcard--active' : ''}`}>
            <h2>iPhone or iPad (Safari)</h2>
            <ol className="list">
              <li>Tap the Share button</li>
              <li>Choose <strong>Add to Home Screen</strong></li>
              <li>Tap <strong>Add</strong></li>
            </ol>
          </section>
          <section className={`pcard${!isIOS ? ' pcard--active' : ''}`}>
            <h2>Android or computer (Chrome, Edge)</h2>
            <ol className="list">
              <li>Open the browser menu (⋮)</li>
              <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong></li>
            </ol>
          </section>
        </div>
      )}
    </>
  );
}
