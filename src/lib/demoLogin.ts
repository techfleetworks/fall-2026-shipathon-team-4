/**
 * Demo log-in: these public details open Theo's synthetic demo (the same data as "Explore with demo data").
 * They are not a real account and are meant to be shared with testers, so they live in the code on purpose.
 * Logging in with them replaces what's on this device with Theo's demo, exactly like the demo button does.
 */
export const DEMO_LOGIN = { email: 'theo@demo.com', password: 'DemoUser123!' } as const;

/** True for the demo details. The email ignores case and spaces; the password must match exactly. */
export function isDemoLogin(email: string, password: string): boolean {
  return email.trim().toLowerCase() === DEMO_LOGIN.email && password === DEMO_LOGIN.password;
}
