/**
 * Encrypted shared briefs (ADR-020): wraps any ShareStore so the brief snapshot (now possibly the whole case history) is
 * stored encrypted, like records (ADR-018). Same key; each envelope is bound to its link (the token hash), so a snapshot
 * can't be moved to another link. The store underneath never sees a readable brief.
 *
 * Older links made before this change hold a plain brief: they still open (read as-is) until they expire.
 */
import { decryptJson, encryptJson, isEnvelope, SHARE_CONTEXT, type Envelope, type RecordKeys } from '../records/crypto.js';
import type { BriefSnapshot } from '../../src/lib/types.js';
import type { ShareStore } from './store.js';

/** How an encrypted brief sits in the brief column. */
interface Sealed { sealed: Envelope }
const isSealed = (v: unknown): v is Sealed => !!v && typeof v === 'object' && isEnvelope((v as Partial<Sealed>).sealed);

export function encryptedShareStore(inner: ShareStore, keys: RecordKeys): ShareStore {
  return {
    ...inner,
    create(userId, recipient, brief, tokenHash, expiresAt) {
      const sealed: Sealed = { sealed: encryptJson(brief, SHARE_CONTEXT(tokenHash), keys) };
      return inner.create(userId, recipient, sealed as unknown as BriefSnapshot, tokenHash, expiresAt);
    },
    async findByTokenHash(tokenHash) {
      const found = await inner.findByTokenHash(tokenHash);
      if (!found || !isSealed(found.brief)) return found; // none, or an older plain brief
      // Can't be decrypted (wrong key, tampered, moved): throws → 500, never a wrong brief.
      return { ...found, brief: decryptJson(found.brief.sealed, SHARE_CONTEXT(tokenHash), keys) as BriefSnapshot };
    },
  };
}
