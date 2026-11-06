import { useEffect, useState, type ReactNode } from 'react';
import { DISCLAIMER } from '../lib/translate';
import { IconCheck } from './Icons';

export function Chip({ selected, onClick, children }: { selected?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={!!selected} onClick={onClick}>
      {children}
    </button>
  );
}

/** Single-select chip group. Clicking the selected chip clears it. */
export function ChipSelect({ options, value, onChange, label }: { options: string[]; value?: string; onChange: (v?: string) => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <Chip key={o} selected={value === o} onClick={() => onChange(value === o ? undefined : o)}>{o}</Chip>
      ))}
    </div>
  );
}

export function ChipMulti({ options, value, onChange, label }: { options: string[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <Chip key={o} selected={value.includes(o)} onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}>
          {o}
        </Chip>
      ))}
    </div>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="check-box">{checked && <IconCheck width={18} height={18} />}</span>
      <span>{children}</span>
    </label>
  );
}

export function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="progress" style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }} aria-label={`Step ${step} of ${total}`} role="img">
      {Array.from({ length: total }, (_, i) => <span key={i} className={`progress__seg${i < step ? ' on' : ''}`} />)}
    </div>
  );
}

export function Disclaimer() {
  return <p className="small muted">{DISCLAIMER}</p>;
}

export function Skeleton({ width = '100%' }: { width?: string }) {
  return <div className="skeleton" style={{ width }} />;
}

export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg ? <div className="toast" role="status">{msg}</div> : null, setMsg];
}
