import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/store';
import { IconBack, IconBook, IconCalendar, IconClose, IconGear, IconHome } from './Icons';
import { APP_NAME } from '../lib/brand';
import { Brand } from './Brand';

/** Site map: logged-in top navigation is Home · Visits · Playbooks · Settings. */
const TABS = [
  { to: '/home', label: 'Home', Icon: IconHome, match: ['/home'] },
  { to: '/visits', label: 'Visits', Icon: IconCalendar, match: ['/visits', '/story', '/case', '/brief', '/today', '/follow-up', '/escalation'] },
  { to: '/playbooks', label: 'Playbooks', Icon: IconBook, match: ['/playbooks', '/scripts'] },
  { to: '/settings', label: 'Settings', Icon: IconGear, match: ['/settings'] },
];

function useActiveTab() {
  const { pathname } = useLocation();
  return TABS.find((t) => t.match.some((m) => pathname === m || pathname.startsWith(m + '/')))?.to;
}

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
          <div className="prepared">Prepared by the patient with {APP_NAME}. Patient-reported.</div>
        )}
        {(footer === 'help' || footer === 'prepared+help') && <HelpBar />}
      </div>
    </div>
  );
}

export function HelpBar() {
  return (
    <div className="helpbar">
      <Link to="/help-now">Need help now? Call or text 988</Link>
    </div>
  );
}

function BrandHeader() {
  const profile = useApp((s) => s.profile);
  const signedIn = !!profile?.onboarded;
  const active = useActiveTab();
  return (
    <header className="header header--brand">
      <Link to={signedIn ? '/home' : '/'} className="brand" aria-label={`${APP_NAME} home`}><Brand /></Link>
      {signedIn ? (
        <nav className="topnav" aria-label="Main">
          {TABS.map((t) => (
            <Link key={t.to} to={t.to} className={active === t.to ? 'active' : undefined} aria-current={active === t.to ? 'page' : undefined}>{t.label}</Link>
          ))}
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
      <div className="header__right">{right}{!exit && <AccountLink />}</div>
    </header>
  );
}

/** Every page shows the crisis line in the header (site map). */
function AccountLink() {
  return <Link to="/help-now" className="header-link header-988">Help · 988</Link>;
}

function AccountMenu() {
  const profile = useApp((s) => s.profile);
  const signOut = useApp((s) => s.signOut);
  const navigate = useNavigate();
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
      <Link to="/help-now" className="pub-help pub-help--app" aria-label="Need to talk? Call or text 988">Need to talk?</Link>
      <Link to="/help-now" className="header-link header-988 header-988--phone">Help · 988</Link>
      <button className="avatar" aria-label="Account menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {initial}
      </button>
      {open && (
        <div className="menu" role="menu" onClick={() => setOpen(false)}>
          <Link to="/settings/profile" role="menuitem">Profile</Link>
          <Link to="/settings/privacy" role="menuitem">Privacy and data</Link>
          <Link to="/faq" role="menuitem">Help</Link>
          <Link to="/help-now" role="menuitem">Crisis help (988)</Link>
          <button role="menuitem" onClick={() => { signOut(); navigate('/', { replace: true }); }}>Log out</button>
        </div>
      )}
    </div>
  );
}

function TabBar() {
  const active = useActiveTab();
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(({ to, label, Icon }) => (
        <Link key={to} to={to} className={`tab${active === to ? ' active' : ''}`} aria-current={active === to ? 'page' : undefined}>
          <span className="tab__icon"><Icon /></span>
          {label}
        </Link>
      ))}
    </nav>
  );
}
