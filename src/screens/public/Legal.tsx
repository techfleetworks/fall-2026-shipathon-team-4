import type { ReactNode } from 'react';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import { PublicLayout } from '../../components/PublicLayout';
import { APP_NAME } from '../../lib/brand';

/**
 * P8 · Terms · Privacy policy · Consent and recording · Cookies.
 * Plain-language summary on top; full text below.
 * DRAFT copy written from PRD §7 — needs counsel review before launch.
 */
interface Doc {
  title: string;
  short: string;
  sections: { h: string; body: ReactNode }[];
}

const DOCS: Record<string, Doc> = {
  terms: {
    title: 'Terms of use',
    short: `${APP_NAME} helps you prepare for and follow up on visits. It is not medical advice and not a crisis service.`,
    sections: [
      {
        h: 'What the service is',
        body: <p>A tool to help you describe what you’re experiencing, prepare a brief for your clinician, and keep track of what happens after. It does not diagnose, and it does not tell you to start, stop or change any medication.</p>,
      },
      {
        h: 'Who can use it',
        body: <p>Adults 18 and over in the United States.</p>,
      },
      {
        h: 'In a crisis',
        body: <p>{APP_NAME} is not an emergency service. If you’re thinking about harming yourself or someone else, call or text 988, or call 911.</p>,
      },
      {
        h: 'Your content',
        body: <p>What you write belongs to you. You can export or delete it at any time.</p>,
      },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    short: 'We never sell your data, run ads, or use it to train AI. You control who sees what, and you can delete it anytime.',
    sections: [
      {
        h: 'What we collect',
        body: (
          <ul>
            <li>Your email, to sign in.</li>
            <li>What you type or say before a visit — your notes and how you’re feeling — used to build your summary.</li>
            <li>If you record a visit, the audio is deleted as soon as it’s transcribed; we don’t keep raw audio.</li>
            <li>Transcripts are kept only long enough to make and let you review your summary, then auto-deleted.</li>
            <li>Your summaries and visit history, kept until you delete them.</li>
            <li>Basic app and device info needed to keep the app working.</li>
          </ul>
        ),
      },
      {
        h: 'Who we share it with',
        body: (
          <ul>
            <li>No one, by default — your information isn’t visible to anyone else unless you choose to share it.</li>
            <li>When you choose: show your summary in the room, or send your doctor a link that expires. You can stop sharing anytime.</li>
            <li>Our AI provider processes your words to create your summary, under contract not to train its models on your data.</li>
            <li>We never sell your data, run ads, or give it to advertisers.</li>
            <li>We never share your individual health conversations with a payer — or anyone — without your explicit consent.</li>
          </ul>
        ),
      },
      {
        h: 'Your choices',
        body: (
          <ul>
            <li>Download a copy of your data from Settings.</li>
            <li>Delete any single entry, or delete everything, from Settings.</li>
          </ul>
        ),
      },
    ],
  },
  consent: {
    title: 'Consent and recording',
    short: 'Visit capture only happens with your OK and your clinician’s. The app works fully without recording.',
    sections: [
      {
        h: 'Two layers of consent',
        body: <p>You agree in the app first. Then you ask your clinician in the room — we give you the words to use. If either of you says no, nothing is recorded, and every other feature still works.</p>,
      },
      {
        h: 'What happens to audio',
        body: <p>Audio is turned into text and then deleted right away. We never store recordings.</p>,
      },
      {
        h: 'State laws differ',
        body: <p>Some states require everyone in a conversation to agree to recording, and some clinics don’t allow it. When in doubt, type your notes instead.</p>,
      },
    ],
  },
  cookies: {
    title: 'Cookies',
    short: 'No advertising or tracking cookies.',
    sections: [
      {
        h: 'What we store in your browser',
        body: <p>Your saved data and settings (like text size) are kept in your browser’s storage so the app works, including offline. Clearing your browser data removes them.</p>,
      },
      {
        h: 'What we don’t use',
        body: <p>No advertising cookies, no cross-site tracking, and no third-party analytics.</p>,
      },
    ],
  },
};

const NAV = [
  { slug: 'terms', label: 'Terms of use' },
  { slug: 'privacy', label: 'Privacy policy' },
  { slug: 'consent', label: 'Consent and recording' },
  { slug: 'cookies', label: 'Cookies' },
];

export function Legal() {
  const { doc = 'privacy' } = useParams();
  const d = DOCS[doc];
  if (!d) return <Navigate to="/legal/privacy" replace />;

  return (
    <PublicLayout>
      <main id="main" className="pub-main">
        <div className="legal">
          <nav className="legal-nav" aria-label="Legal">
            {NAV.map((n) => <NavLink key={n.slug} to={`/legal/${n.slug}`}>{n.label}</NavLink>)}
          </nav>
          <article className="legal-body">
            <h1>{d.title}</h1>
            <div className="pcard pcard--muted">
              <span className="eyebrow">The short version</span>
              <p>{d.short}</p>
            </div>
            {d.sections.map((s) => (
              <section key={s.h} className="stack-sm">
                <h2>{s.h}</h2>
                {s.body}
              </section>
            ))}
            <p className="small muted">Draft — pending legal review.</p>
          </article>
        </div>
      </main>
    </PublicLayout>
  );
}
