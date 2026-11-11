import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/PublicLayout';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Is it really free?',
    a: 'Yes. It’s free for patients, always. We never sell your data or show ads.',
  },
  {
    q: 'Will my doctor see this?',
    a: 'Only if you share it. You can show your brief in the room or send a link that expires.',
  },
  {
    q: 'Is this a diagnosis or medical advice?',
    a: 'No. We help you put what you’re experiencing into words your doctor can act on, and suggest questions to ask. Decisions about diagnosis and treatment stay between you and your clinician.',
  },
  {
    q: 'Can my family see my data?',
    a: 'Only if you invite them. You decide what a family member or partner can see, and you can change or remove their access anytime.',
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
            {list.map((f, i) => (
              <details key={f.q} open={!query && i === 1}>
                <summary>{f.q}</summary>
                <p className="faq-a">{f.a}</p>
              </details>
            ))}
          </div>
        ) : (
          <p className="muted">No questions match “{query}”. <Link to="/help-now">Need help now? Call or text 988.</Link></p>
        )}
      </main>
    </PublicLayout>
  );
}
