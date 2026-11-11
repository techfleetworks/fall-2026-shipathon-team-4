/**
 * Placeholder illustrations for the amber panels in the hi-fi designs.
 * Simple, on-brand shapes until final illustrations arrive. Decorative only.
 */
const ink = '#1e2a44';
const teal = '#1f6b63';
const paper = '#ffffff';
const sand = '#e9d3a6';

/** Hero: patient's words → doctor-ready card */
export function HeroArt() {
  return (
    <svg viewBox="0 0 360 240" aria-hidden="true">
      <rect x="20" y="34" width="170" height="86" rx="18" fill={paper} stroke={ink} strokeWidth="2" />
      <path d="M52 120 l-12 24 l34 -24" fill={paper} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
      <rect x="42" y="58" width="100" height="10" rx="5" fill={sand} />
      <rect x="42" y="80" width="126" height="10" rx="5" fill={sand} />
      <path d="M200 92 q20 -4 34 10" fill="none" stroke={ink} strokeWidth="2" strokeDasharray="4 6" strokeLinecap="round" />
      <rect x="172" y="104" width="168" height="116" rx="18" fill={teal} />
      <rect x="192" y="126" width="64" height="10" rx="5" fill="#bfe0da" />
      <rect x="192" y="148" width="124" height="8" rx="4" fill="#e2efed" />
      <rect x="192" y="166" width="104" height="8" rx="4" fill="#e2efed" />
      <rect x="192" y="184" width="116" height="8" rx="4" fill="#e2efed" />
      <circle cx="318" cy="128" r="9" fill="#f2b84b" />
    </svg>
  );
}

export function TalkArt() {
  return (
    <svg viewBox="0 0 300 150" aria-hidden="true">
      <circle cx="80" cy="75" r="38" fill={ink} />
      <rect x="70" y="52" width="20" height="34" rx="10" fill={paper} />
      <path d="M62 78 a18 18 0 0 0 36 0" fill="none" stroke={paper} strokeWidth="3" />
      <rect x="140" y="40" width="130" height="70" rx="14" fill={paper} stroke={ink} strokeWidth="2" />
      <rect x="156" y="58" width="80" height="8" rx="4" fill={sand} />
      <rect x="156" y="74" width="98" height="8" rx="4" fill={sand} />
      <rect x="156" y="90" width="60" height="8" rx="4" fill={sand} />
    </svg>
  );
}

export function BriefArt() {
  return (
    <svg viewBox="0 0 300 150" aria-hidden="true">
      <rect x="90" y="14" width="120" height="124" rx="12" fill={paper} stroke={ink} strokeWidth="2" />
      <rect x="106" y="32" width="60" height="10" rx="5" fill={teal} />
      {[56, 80, 104].map((y, i) => (
        <g key={y}>
          <text x="106" y={y + 8} fontSize="12" fontWeight="700" fill={ink}>{i + 1}.</text>
          <rect x="122" y={y} width={70 - i * 10} height="9" rx="4.5" fill={sand} />
        </g>
      ))}
    </svg>
  );
}

export function SummaryArt() {
  return (
    <svg viewBox="0 0 300 150" aria-hidden="true">
      <rect x="40" y="22" width="130" height="106" rx="12" fill={paper} stroke={ink} strokeWidth="2" />
      <rect x="56" y="40" width="70" height="9" rx="4.5" fill={teal} />
      <rect x="56" y="60" width="94" height="8" rx="4" fill={sand} />
      <rect x="56" y="76" width="80" height="8" rx="4" fill={sand} />
      <rect x="56" y="98" width="60" height="16" rx="8" fill="#f2b84b" />
      <rect x="190" y="40" width="74" height="74" rx="14" fill={teal} />
      <path d="M210 78 l12 12 l24 -26" fill="none" stroke={paper} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Auth side panel: a shield + lock */
export function PrivacyArt() {
  return (
    <svg viewBox="0 0 360 200" aria-hidden="true">
      <path d="M180 22 l70 24 v48 c0 44 -32 70 -70 84 c-38 -14 -70 -40 -70 -84 v-48 z" fill={teal} />
      <rect x="152" y="92" width="56" height="44" rx="8" fill={paper} />
      <path d="M162 92 v-12 a18 18 0 0 1 36 0 v12" fill="none" stroke={paper} strokeWidth="6" />
      <circle cx="180" cy="112" r="6" fill={teal} />
      <rect x="176" y="114" width="8" height="12" rx="3" fill={teal} />
    </svg>
  );
}
