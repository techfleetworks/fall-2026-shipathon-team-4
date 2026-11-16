import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PrivacyArt } from '../../components/Art';
import { PublicLayout } from '../../components/PublicLayout';
import { hashPassword, verifyPassword } from '../../lib/password';
import { isServerAuthEnabled, logIn, signUp } from '../../lib/auth';
import { selectHasAccount, useApp } from '../../lib/store';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * P7 · Sign up / Log in — tabs swap on one page.
 *
 * LOCAL-ONLY MVP: there is no server yet, so "Create free account" sets up a
 * profile on this device and continues to onboarding. The password is checked
 * for length but never stored. Real auth (Supabase, per ADR-001) replaces this.
 */
export function Auth({ mode }: { mode: 'signup' | 'login' }) {
  const navigate = useNavigate();
  const profile = useApp((s) => s.profile);
  const hasAccount = useApp(selectHasAccount);
  const signIn = useApp((s) => s.signIn);
  const [busy, setBusy] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchTo = (m: 'signup' | 'login') => {
    setError(null);
    setConfirm('');
    setShowReset(false);
    navigate(`/${m}`, { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (mode === 'signup' && !firstName.trim()) return setError('Enter your first name.');
    if (mode === 'signup' && !lastName.trim()) return setError('Enter your last name.');
    if (!EMAIL_RE.test(em)) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    if (mode === 'signup' && password !== confirm) return setError('Those passwords don’t match. Type the same password in both fields.');

    // Sign-in server (Supabase, ADR-001) when it's set up; otherwise the on-device version below.
    if (isServerAuthEnabled()) {
      setBusy(true);
      const result = mode === 'signup'
        ? await signUp({ email: em, password, firstName: firstName.trim(), lastName: lastName.trim() })
        : await logIn({ email: em, password });
      setBusy(false);
      if (result.status === 'error' || result.status === 'confirm-email') return setError(result.message);
      if (result.status !== 'ok') return setError('Sign-in isn’t available right now. Please try again.');
      // This device already has this person's app data: just sign in.
      if (mode === 'login' && profile?.onboarded && profile.email === em) {
        signIn();
        return navigate('/home', { replace: true });
      }
      // New account, or a device without their data yet: finish setup here (consent is asked on every device).
      return navigate('/welcome', { state: { email: em, firstName: result.user.firstName || firstName.trim(), lastName: result.user.lastName || lastName.trim() } });
    }

    if (mode === 'signup') {
      if (hasAccount) {
        return setError('There’s already an account on this device. Log in instead, or delete that account from Settings first.');
      }
      setBusy(true);
      const passwordHash = await hashPassword(password);
      setBusy(false);
      return navigate('/welcome', { state: { email: em, firstName: firstName.trim(), lastName: lastName.trim(), passwordHash } });
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
              <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => switchTo('signup')}>Create account</button>
              <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchTo('login')}>Log in</button>
            </div>

            {mode === 'signup' && (
              <>
                <div className="field">
                  <label htmlFor="first">First Name</label>
                  <input id="first" className="input" autoComplete="given-name" placeholder="John" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="last">Last Name</label>
                  <input id="last" className="input" autoComplete="family-name" placeholder="Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" className="input" type="email" autoComplete="email" placeholder="you@email.com"
                value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error && !EMAIL_RE.test(email.trim())} />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} />
              {mode === 'login' && (
                <button type="button" className="btn btn--link auth-forgot" aria-expanded={showReset} aria-controls="reset-note" onClick={() => setShowReset((v) => !v)}>
                  Forgot your password?
                </button>
              )}
            </div>
            {mode === 'login' && showReset && (
              <p id="reset-note" className="form-note" role="status">
                Password reset isn’t available in this version yet. If you can’t remember your password, you’ll need to create a new account.
              </p>
            )}
            {mode === 'signup' && (
              <div className="field">
                <label htmlFor="confirm">Confirm Password</label>
                <input id="confirm" className="input" type="password" autoComplete="new-password"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!error && !!confirm && confirm !== password} />
              </div>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}

            <button type="submit" disabled={busy} className="btn btn--lg btn--block btn--primary">
              {mode === 'signup' ? 'Create free account' : 'Log in'}
            </button>
            <p className="form-note">
              By continuing you agree to the <Link to="/legal/terms">Terms</Link> and <Link to="/legal/privacy">Privacy policy</Link>.
            </p>
            {!isServerAuthEnabled() && <p className="form-note">This version keeps your data on this device only.</p>}
          </form>
        </section>
      </main>
    </PublicLayout>
  );
}
