import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { selectSignedIn, useApp } from '../lib/store';
import { APP_NAME } from '../lib/brand';
import { Brand, BrandMark } from './Brand';

const NAV = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/privacy-promise', label: 'Privacy' },
  { to: '/faq', label: 'FAQ' },
];

interface Props {
  children: ReactNode;
  /** 'full' = nav + auth buttons (P1–P8); 'minimal' = brand + help link only; 'back' = brand + Back (P5) */
  header?: 'full' | 'minimal' | 'back';
  footer?: boolean;
  onBack?: () => void;
}

/** Extra room (px) the header must have beyond its content before every link is shown inline. */
const HEADER_SLACK = 32;

/**
 * True when the full header (brand, links, help, auth buttons) doesn't fit in the header with
 * comfortable spacing. Measures a hidden copy laid out at its natural width, so it reacts to the
 * window size, text size setting and signed-in state rather than to fixed breakpoints.
 */
function useCompactHeader(enabled: boolean) {
  const headerRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const header = headerRef.current;
    const measure = measureRef.current;
    if (!enabled || !header || !measure) return setCompact(false);
    const check = () => setCompact(header.clientWidth < measure.scrollWidth + HEADER_SLACK);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(header);
    ro.observe(measure);
    return () => ro.disconnect();
  }, [enabled]);
  return { headerRef, measureRef, compact };
}

/** Shell for the public (logged-out) site. 988 is reachable from every page. */
export function PublicLayout({ children, header = 'full', footer = true, onBack }: Props) {
  const signedIn = useApp(selectSignedIn);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  const { headerRef, measureRef, compact } = useCompactHeader(header === 'full');
  useEffect(() => { if (!compact) setOpen(false); }, [compact]);

  return (
    <div className="pub">
      <a href="#main" className="sr-only">Skip to content</a>
      <header ref={headerRef} className={`pub-header${compact ? ' pub-header--compact' : ''}`}>
        <Link to="/" className="pub-brand" aria-label={`${APP_NAME} home`}><BrandMark /><Brand /></Link>

        {header === 'full' && (
          <nav className="pub-nav" aria-label="Main">
            {NAV.map((n) => <NavLink key={n.to} to={n.to}>{n.label}</NavLink>)}
          </nav>
        )}

        <div className="pub-actions">
          {header !== 'back' && <Link to="/help-now" className="pub-help">Need to talk?</Link>}
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

        {header === 'full' && compact && open && (
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
      {header === 'full' && (
        // Hidden copy of the full header at its natural width; only used to decide `compact`.
        // Wrapped in a zero-size clipped box so it never widens the page (no sideways scroll on phones).
        <div className="pub-measure-wrap" aria-hidden="true">
        <div ref={measureRef} className="pub-header pub-header--measure">
          <span className="pub-brand"><BrandMark /><Brand /></span>
          <div className="pub-nav">{NAV.map((n) => <a key={n.to}>{n.label}</a>)}</div>
          <div className="pub-actions">
            <span className="pub-help">Need to talk?</span>
            <span className="pub-auth btn-row">
              {signedIn ? <span className="btn btn--primary">Open my app</span> : (
                <><span className="btn btn--outline">Log in</span><span className="btn btn--primary">Sign up free</span></>
              )}
            </span>
          </div>
        </div>
        </div>
      )}

      {children}

      {footer && (
        <footer className="pub-footer">
          <span className="muted">© {APP_NAME}</span>
          <Link to="/legal/terms">Terms</Link>
          <Link to="/legal/privacy"><span className="foot-long">Privacy policy</span><span className="foot-short">Privacy</span></Link>
          <Link to="/help-now" className="pub-help"><span className="foot-long">Need to talk? </span>Call or Text 988</Link>
        </footer>
      )}
    </div>
  );
}
