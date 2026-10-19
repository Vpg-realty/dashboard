// Ends the Cloudflare Access session, so the next visit asks for the emailed
// code again (the account menu's Log out, and TV mode's for the TV account).
export function logout() {
  try { sessionStorage.removeItem('vpg.viewAs'); } catch { /* storage blocked */ }
  window.location.href = '/cdn-cgi/access/logout';
}
