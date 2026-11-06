/**
 * Crisis keyword backstop (PRD F6 / J5).
 * Runs on every piece of free text BEFORE translation. A flagged message is never
 * translated, summarized or saved. It is deliberately conservative: a false alarm
 * shows support resources, a miss is worse.
 *
 * NOTE: rule-based only. The PRD calls for a classifier + this keyword backstop;
 * the classifier comes with the API.
 */
const CRISIS_PATTERNS: RegExp[] = [
  /\bkill(ing)?\s+my\s*self\b/i,
  /\bsuicid(e|al)\b/i,
  /\bend\s+(my\s+life|it\s+all|things)\b/i,
  /\b(don'?t|do\s+not)\s+want\s+to\s+(live|be\s+alive|be\s+here|wake\s+up|exist)\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bwish\s+i\s+(was|were)\s+dead\b/i,
  /\bbetter\s+off\s+(dead|without\s+me)\b/i,
  /\b(don'?t|do\s+not|can'?t)\s+see\s+(the|any)\s+point\b/i,
  /\bno\s+(point|reason)\s+(in\s+)?(living|going\s+on|anymore|to\s+live)\b/i,
  /\b(hurt|harm|cut|cutting)\s+my\s*self\b/i,
  /\bself[-\s]?harm\b/i,
  /\boverdos(e|ing)\b/i,
  /\b(hurt|kill|harm)\s+(someone|somebody|others|people|him|her|them)\b/i,
  /\bnot\s+wake\s+up\b/i,
];

export function hasCrisisLanguage(...texts: (string | undefined)[]): boolean {
  return texts.some((t) => !!t && CRISIS_PATTERNS.some((re) => re.test(t)));
}
