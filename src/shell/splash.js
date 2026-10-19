// How often the splash shows, each person's choice in the account menu (Luke,
// Oct 19): every day (default) · Mondays · off. Kept on this device.
export const SPLASH_CHOICES = [['daily', 'Every day'], ['mondays', 'Mondays'], ['off', 'Off']];
const splashKey = (email) => `vpg.splash.${email || 'anon'}`;
export function getSplash(email) { try { return localStorage.getItem(splashKey(email)) || 'daily'; } catch { return 'daily'; } }
export function setSplash(email, v) { try { localStorage.setItem(splashKey(email), v); } catch { /* storage blocked */ } }
