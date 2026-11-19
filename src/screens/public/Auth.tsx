import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PrivacyArt } from '../../components/Art';
import { PublicLayout } from '../../components/PublicLayout';
import { verifyPassword } from '../../lib/password';
import { isServerAuthEnabled, logIn, requestPasswordReset } from '../../lib/auth';
import { fetchMyAppData } from '../../lib/demoApi';
import { restoreBackupAfterLogin } from '../../lib/sync';
import { SITE } from '../../lib/siteMode';
import { selectHasAccount, useApp } from '../../lib/store';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * P7 · Sign up / Log in — tabs swap on one page.
 *
 * Create account asks only for a first name: it sets up a profile on this
 * device (no email or password) and continues to onboarding.
 * Log in still uses email and password (Supabase, per ADR-001, when configured).
 */
export function Auth({ mode }: { mode: 'signup' | 'login' }) {
  const navigate = useNavigate();
  const profile = useApp((s) => s.profile);
  const hasAccount = useApp(selectHasAccount);
  const signIn = useApp((s) => s.signIn);
  const loadDemo = useApp((s) => s.loadDemo);
  const [busy, setBusy] = useState(false);
  const [firstName, setFirstName] = useState('');
  // Demo site: "Log in as Theo" on the start page fills in his login (ADR-016, team option A).
  const [params] = useSearchParams();
  const theo = SITE.mode === 'demo' && params.get('as') === 'theo' ? SITE.demoLogin : undefined;
  const [email, setEmail] = useState(theo?.email ?? '');
  const [password, setPassword] = useState(theo?.password ?? '');
  const [showReset, setShowReset] = useState(params.get('reset') === '1');
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  // Password reset (ADR-023): only with server sign-in, and never on the demo site (Theo's shared account).
  const canReset = isServerAuthEnabled() && SITE.mode !== 'demo';
  const sendReset = async () => {
    setResetMsg(null);
    if (!EMAIL_RE.test(email.trim())) return setResetMsg('Enter your email address above first.');
    setResetBusy(true);
    const out = await requestPasswordReset(email);
    setResetBusy(false);
    setResetMsg(out.status === 'not-configured' ? 'Password reset isn’t available right now.' : out.message);
  };
  const [error, setError] = useState<string | null>(null);
  // Also when arriving from another page that reuses this screen (e.g. the demo's sign-up notice → "Log in as Theo").
  useEffect(() => {
    if (!theo) return;
    setEmail(theo.email);
    setPassword(theo.password);
  }, [theo]);

  const switchTo = (m: 'signup' | 'login') => {
    setError(null);
    setShowReset(false);
    navigate(`/${m}`, { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Create account: first name only, kept on this device.
    if (mode === 'signup') {
      if (!firstName.trim()) return setError('Enter your first name.');
      if (hasAccount) {
        return setError('There’s already an account on this device. Log in instead, or delete that account from Settings first.');
      }
      return navigate('/welcome', { state: { firstName: firstName.trim() } });
    }

    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Use at least 8 characters for your password.');

    // Sign-in server (Supabase, ADR-001) when it's set up; otherwise the on-device version below.
    if (isServerAuthEnabled()) {
      setBusy(true);
      const result = await logIn({ email: em, password });
      setBusy(false);
      if (result.status === 'error' || result.status === 'confirm-email') return setError(result.message);
      if (result.status !== 'ok') return setError('Sign-in isn’t available right now. Please try again.');
      // Theo (the shared demo account): load his record from the server and go straight in (ADR-010).
      {
        const mine = await fetchMyAppData();
        if (mine?.isDemoAccount) {
          loadDemo(mine.data);
          signIn();
          return navigate('/home', { replace: true });
        }
      }
      // This device already has this person's app data: just sign in.
      if (profile?.onboarded && profile.email === em) {
        signIn();
        return navigate('/home', { replace: true });
      }
      // A device with no account data yet, and they backed up on another device: restore it (Visit store, ADR-019).
      // Never when someone else's data is on this device, so two people's records are never mixed.
      if (!profile?.onboarded && (await restoreBackupAfterLogin())) {
        useApp.getState().updateProfile({ email: em });
        signIn();
        return navigate('/home', { replace: true });
      }
      // A device without their data yet: finish setup here (consent is asked on every device).
      return navigate('/welcome', { state: { email: em, firstName: result.user.firstName, lastName: result.user.lastName } });
    }

    // Log in: only accounts set up on this device exist in this version.
    const notFound = 'That email and password don’t match an account on this device. Accounts don’t sync between devices yet.';
    if (!profile?.onboarded || (profile.email && profile.email !== em)) return setError(notFound);
    if (profile.passwordHash) {
      setBusy(true);
      const ok = await verifyPassword(password, profile.passwordHash);
      setBusy(false);
      if (!ok) return setError(notFound);
    }
    signIn();
    navigate('/home', { replace: true });
  };

  // Demo site (ADR-016): no sign-up here. Its own Supabase project holds only Theo; real accounts live on the real site.
  if (SITE.mode === 'demo' && mode === 'signup') return <DemoSignUpNotice />;

  return (
    <PublicLayout footer={false}>
      <main id="main" className="auth">
        <section className="auth-side">
          <h1>Free for you.</h1>
          <p className="pub-sub" style={{ fontSize: '1.05rem' }}>We never sell your data. You control who sees what.</p>
          {/* Placeholder until the final photo asset lands in /public. */}
          <div className="art auth-art"><PrivacyArt /></div>
        </section>

        <section className="auth-form">
          <form onSubmit={submit} noValidate>
            <div className="tabs" role="tablist" aria-label="Account">
              {SITE.mode !== 'demo' && <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => switchTo('signup')}>Create account</button>}
              <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchTo('login')}>Log in</button>
            </div>

            {mode === 'signup' && (
              <div className="field">
                <label htmlFor="first">First Name</label>
                <input id="first" className="input" autoComplete="given-name" placeholder="John" value={firstName}
                  onChange={(e) => setFirstName(e.target.value)} aria-invalid={!!error && !firstName.trim()} />
              </div>
            )}
            {mode === 'login' && (<>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" className="input" type="email" autoComplete="email" placeholder="you@email.com"
                value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error && !EMAIL_RE.test(email.trim())} />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" className="input" type="password" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="btn btn--link auth-forgot" aria-expanded={showReset} aria-controls="reset-note" onClick={() => setShowReset((v) => !v)}>
                Forgot your password?
              </button>
            </div>
            {showReset && (canReset ? (
              <div id="reset-note" className="stack-sm">
                <p className="form-note" style={{ margin: 0 }}>We’ll email you a link to choose a new password. Use the email you signed up with, above.</p>
                <button type="button" className="btn btn--outline btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => void sendReset()} disabled={resetBusy} aria-busy={resetBusy}>
                  {resetBusy ? 'Sending…' : 'Send reset link'}
                </button>
                {resetMsg && <p className="form-note" role="status" style={{ margin: 0 }}>{resetMsg}</p>}
              </div>
            ) : (
              <p id="reset-note" className="form-note" role="status">
                Password reset isn’t available in this version yet. If you can’t remember your password, you’ll need to create a new account.
              </p>
            ))}
            {params.get('reset') === 'done' && (
              <p className="form-note" role="status">Your password was changed. Log in with your new password.</p>
            )}
            </>)}
            {error && <p className="form-error" role="alert">{error}</p>}

            <button type="submit" disabled={busy} className="btn btn--lg btn--block btn--primary">
              {mode === 'signup' ? 'Create free account' : 'Log in'}
            </button>
            <p className="form-note">
              By continuing you agree to the <Link to="/legal/terms">Terms</Link> and <Link to="/legal/privacy">Privacy policy</Link>.
            </p>
            {(mode === 'signup' || !isServerAuthEnabled()) && <p className="form-note">This version keeps your data on this device only.</p>}
          </form>
        </section>
      </main>
    </PublicLayout>
  );
}

/** Demo site: "Sign up" explains where real accounts are made, and offers Theo's login instead. */
function DemoSignUpNotice() {
  return (
    <PublicLayout header="minimal">
      <main id="main" className="pub-main pub-main--narrow">
        <span className="eyebrow">Demo</span>
        <h1>This is the demo, with Theo</h1>
        <p className="pub-lead">
          Theo is a made-up patient, so you can see how the app works with real-looking information. To use it with your own
          appointments, create your free account on the real app.
        </p>
        <div className="btn-row">
          {SITE.liveUrl && (
            <a className="btn btn--primary" href={`${SITE.liveUrl}/signup`} rel="noopener noreferrer">Create my free account ↗</a>
          )}
          <Link className="btn btn--outline" to="/login?as=theo">Log in as Theo</Link>
        </div>
        <p className="small muted">Synthetic — illustrative only, not medical advice.</p>
      </main>
    </PublicLayout>
  );
}
