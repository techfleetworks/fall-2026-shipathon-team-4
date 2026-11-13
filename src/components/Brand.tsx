import { APP_NAME, APP_SHORT_NAME } from '../lib/brand';

/**
 * Logo wordmark. Shows the full name wherever it fits and swaps to the short
 * form on phone-width headers (CSS: .brand-full / .brand-short). Screen readers
 * always hear the full name.
 */
export function Brand() {
  return (
    <>
      <span className="brand-full">{APP_NAME}</span>
      <span className="brand-short" aria-hidden="true">{APP_SHORT_NAME}</span>
    </>
  );
}

/** Logo mark: speech bubble with a voice waveform. Decorative; the wordmark carries the name. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 52 46" aria-hidden="true">
      <path d="M8 0h36a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H20l-9 8v-8H8a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8z" fill="#1F6B63" />
      <g stroke="#F5F2EB" strokeWidth="2.6" strokeLinecap="round">
        <path d="M14 15v8" /><path d="M20 11v16" /><path d="M26 13v12" /><path d="M32 9v20" /><path d="M38 15v8" />
      </g>
    </svg>
  );
}
