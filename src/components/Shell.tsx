import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/store';
import { IconBack, IconCase, IconClose, IconHome, IconPeers, IconScript, IconStory } from './Icons';

const TABS = [
  { to: '/home', label: 'Home', Icon: IconHome },
  { to: '/story', label: 'Story', Icon: IconStory },
  { to: '/scripts', label: 'Scripts', Icon: IconScript },
  { to: '/case', label: 'My case', Icon: IconCase },
  { to: '/peers', label: 'Peers', Icon: IconPeers },
];

type HeaderSpec =
  | { kind: 'brand' }
  | { kind: 'sub'; title?: string; back?: string | 'history'; onBack?: () => void; backLabel?: string; exit?: boolean; right?: ReactNode }
  | { kind: 'none' };

interface ShellProps {
  header: HeaderSpec;
  tabs?: boolean;
  footer?: 'help' | 'prepared' | 'prepared+help';
  wide?: boolean;
  children: ReactNode;
}

export function Shell({ header, tabs = false, footer = 'help', wide = false, children }: ShellProps) {
  const demo = useApp((s) => s.demoMode);
  return (
    <div className="shell">
      {header.kind === 'brand' && <BrandHeader />}
      {header.kind === 'sub' && <SubHeader {...header} />}
      {demo && <div className="demo-banner" role="note">Synthetic — illustrative only, not medical advice</div>}
      <main className={`main${wide ? ' main--wide' : ''}`} id="main">
        {children}
      </main>
      <div className="bottom">
        {tabs && <TabBar />}
        {(footer === 'prepared' || footer === 'prepared+help') && (
          <div className="prepared">Prepared by the patient with Get Heard. Patient-reported.</div>
        )}
        {(footer === 'help' || footer === 'prepared+help') && <HelpBar />}
      </div>
    </div>
  );
}

export function HelpBar() {
  return (
    <div className="helpbar">
      <Link to="/help">Need help now? Call or text 988</Link>
    </div>
  );
}

function BrandHeader() {
  const profile = useApp((s) => s.profile);
  const signedIn = !!profile?.onboarded;
  return (
    <header className="header header--brand">
      <Link to={signedIn ? '/home' : '/'} className="brand">Get Heard</Link>
      {signedIn ? (
        <nav className="topnav" aria-label="Main">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to}>{t.label}</NavLink>
          ))}
          <NavLink to="/visits">Visits</NavLink>
        </nav>
      ) : <span />}
      <AccountMenu />
    </header>
  );
}

function SubHeader({ title, back, onBack, backLabel, exit, right }: Extract<HeaderSpec, { kind: 'sub' }>) {
  const navigate = useNavigate();
  const goBack = () => {
    if (onBack) return onBack();
    if (back === 'history' || !back) {
      // Deep links / installed-app launches may have no history to go back to.
      if (window.history.state?.idx > 0) navigate(-1);
      else navigate('/home');
    } else navigate(back);
  };
  return (
    <header className="header">
      <div className="header__left">
        {exit ? (
          <button className="header-link" onClick={goBack}><IconClose /> Exit</button>
        ) : back ? (
          <button className="header-link" onClick={goBack}>
            {backLabel ? backLabel : (<><IconBack /> Back</>)}
          </button>
        ) : null}
      </div>
      <div className="header__title">{title}</div>
      <div className="header__right">{right ?? <AccountLink />}</div>
    </header>
  );
}

function AccountLink() {
  const profile = useApp((s) => s.profile);
  if (!profile?.onboarded) return null;
  return <Link to="/settings" className="header-link">Your account</Link>;
}

function AccountMenu() {
  const profile = useApp((s) => s.profile);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!profile?.onboarded) return <span className="header__end" />;
  const initial = profile.name?.[0]?.toUpperCase() ?? '';
  return (
    <div ref={ref} className="header__end">
      <button className="avatar" aria-label="Account menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {initial}
      </button>
      {open && (
        <div className="menu" role="menu" onClick={() => setOpen(false)}>
          <Link to="/visits" role="menuitem">Visits</Link>
          <Link to="/settings" role="menuitem">Settings & privacy</Link>
          <Link to="/help" role="menuitem">Crisis help (988)</Link>
        </div>
      )}
    </div>
  );
}

function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          <span className="tab__icon"><Icon /></span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
