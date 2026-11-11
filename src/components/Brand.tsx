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
