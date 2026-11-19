/**
 * Where to go once onboarding finishes. Finishing signs the person in, and the public-pages guard then
 * moves them off /welcome: it reads this so they land where onboarding chose (the new visit's
 * Name how I feel), not always on Home.
 */
let target: string | null = null;

export function setAfterOnboarding(path: string | null): void {
  target = path;
}

export function afterOnboarding(): string {
  return target ?? '/home';
}
