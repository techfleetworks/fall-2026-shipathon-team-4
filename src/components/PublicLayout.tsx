import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { selectSignedIn, useApp } from '../lib/store';
import { APP_NAME } from '../lib/brand';
import { Brand } from './Brand';

const NAV = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/privacy-promise', label: 'Privacy' },
  { to: '/faq', label: 'FAQ' },
];

interface Props {
  children: ReactNode;
  /** 'full' = nav + auth buttons (P1–P4, P6, P8); 'minimal' = brand + 988 only (P7); 'back' = brand + Back (P5) */
  header?: 'full' | 'minimal' | 'back';
  footer?: boolean;
  onBack?: () => void;
}

/** Shell for the public (logged-out) site. 988 is reachable from every page. */
export function PublicLayout({ children, header = 'full', footer = true, onBack }: Props) {
  const signedIn = useApp(selectSignedIn);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="pub">
      <a href="#main" className="sr-only">Skip to content</a>
      <header className="pub-header">
        <Link to="/" className="pub-brand" aria-label={`${APP_NAME} home`}><Brand /></Link>

        {header === 'full' && (
          <nav className="pub-nav" aria-label="Main">
            {NAV.map((n) => <NavLink key={n.to} to={n.to}>{n.label}</NavLink>)}
          </nav>
        )}

        <div className="pub-actions">
          {header !== 'back' && <Link to="/help-now" className="pub-help"><span className="help-long">Need help now? </span><span className="help-short">Help </span>988</Link>}
          {header === 'full' && (
            <span className="pub-auth btn-row">
              {signedIn ? (
                <Link to="/home" className="btn btn--primary">Open my app</Link>
              ) : (
                <>
                  <Link to="/login" className="btn btn--outline">Log in</Link>
                  <Link to="/signup" className="btn btn--primary">Sign up free</Link>
                </>
              )}
            </span>
          )}
          {header === 'full' && (
            <button className="btn btn--sm btn--outline pub-menu-btn" aria-expanded={open} aria-controls="pub-mobile-nav" onClick={() => setOpen((o) => !o)}>
              {open ? 'Close' : 'Menu'}
            </button>
          )}
          {header === 'back' && <button className="btn btn--outline" onClick={onBack}>Back</button>}
        </div>

        {header === 'full' && open && (
          <nav id="pub-mobile-nav" className="pub-mobile-nav" aria-label="Main">
            {NAV.map((n) => <NavLink key={n.to} to={n.to}>{n.label}</NavLink>)}
            <div className="btn-row">
              {signedIn ? (
                <Link to="/home" className="btn btn--primary btn--block">Open my app</Link>
              ) : (
                <>
                  <Link to="/login" className="btn btn--outline" style={{ flex: 1 }}>Log in</Link>
                  <Link to="/signup" className="btn btn--primary" style={{ flex: 1 }}>Sign up free</Link>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      {children}

      {footer && (
        <footer className="pub-footer">
          <span className="muted">© {APP_NAME}</span>
          <Link to="/legal/terms">Terms</Link>
          <Link to="/legal/privacy">Privacy policy</Link>
          <Link to="/help-now" className="pub-help">Need help now? Call or text 988</Link>
        </footer>
      )}
    </div>
  );
}
