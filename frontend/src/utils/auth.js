/**
 * Helper to retrieve current authentication bearer token.
 * Uses real Clerk session token, with dev token support for headless browser validation.
 *
 * @param {Function} [clerkGetToken]
 * @returns {Promise<string|null>}
 */
export async function getAuthToken(clerkGetToken) {
  if (typeof window !== 'undefined') {
    const devToken = localStorage.getItem('dev_auth_token');
    if (devToken) return devToken;
  }

  if (typeof clerkGetToken === 'function') {
    try {
      const token = await clerkGetToken();
      if (token) return token;
    } catch (err) {
      console.warn('[Auth] Clerk getToken failed:', err);
    }
  }

  return null;
}
