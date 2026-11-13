import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/PublicLayout';
import { APP_NAME } from '../../lib/brand';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Is it really free?',
    a: 'Yes — free to use. We never sell your data, run ads, or use it to train AI.',
  },
  {
    q: 'Will my doctor see this?',
    a: 'Only if you share it. You can show your summary in the room or send a link that expires.',
  },
  {
    q: 'Is this a diagnosis or medical advice?',
    a: `No. ${APP_NAME} doesn’t diagnose or give medical advice. It helps you organize what you want to say and understand what your doctor said — your clinician makes the medical decisions.`,
  },
  {
    q: 'Can my family see my data?',
    a: 'Only if you choose to share. You control who sees what — by default, no one else, including family, can see your data.',
  },
  {
    q: 'Does it work on my phone?',
    a: 'Yes. It works in any modern phone or computer browser, and you can add it to your home screen like an app. Once it has loaded, it keeps working offline.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Go to Settings → Privacy and data → Delete everything. It takes two taps and can’t be undone. You can download a copy of your data first.',
  },
  {
    q: 'What if I’m in crisis?',
    a: 'Call or text 988 (Suicide & Crisis Lifeline, US) any time, or call 911 if you’re in immediate danger. The 988 link is on every page.',
  },
];

/** P6 · FAQ — answers the adopt-stage doubts first. */
export function Faq() {
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? FAQS.filter((f) => (f.q + ' ' + f.a).toLowerCase().includes(q)) : FAQS;
  }, [query]);

  return (
    <PublicLayout>
      <main id="main" className="pub-main">
        <h1>Questions people ask</h1>
        <label htmlFor="faq-q" className="sr-only">Search questions</label>
        <input id="faq-q" type="search" className="input search" placeholder="Search questions" value={query} onChange={(e) => setQuery(e.target.value)} />

        {list.length ? (
          <div className="faq">
            {list.map((f) => (
              <details key={f.q} open>
                <summary>{f.q}</summary>
                <p className="faq-a">{f.a}</p>
              </details>
            ))}
          </div>
        ) : (
          <p className="muted">No questions match “{query}”. <Link to="/help-now">Need to talk? Call or text 988.</Link></p>
        )}
      </main>
    </PublicLayout>
  );
}
